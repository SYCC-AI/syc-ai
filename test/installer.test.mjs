import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { canonicalReleaseBytes } from '../release-metadata.mjs';

const project = resolve(import.meta.dirname, '..');
const installer = join(project, 'install.sh');

async function executable(path, body) {
  await writeFile(path, body, { mode: 0o755 });
  await chmod(path, 0o755);
}

async function fixture({ expectedHash, restartFails = false, existing = false, legacy = false }) {
  const root = await mkdtemp(join(tmpdir(), 'syc-ai-installer-'));
  const bin = join(root, 'bin');
  const downloads = join(root, 'downloads');
  const installRoot = join(root, 'install');
  const marker = join(root, 'tar-was-run');
  const systemctlLog = join(root, 'systemctl.log');
  const legacyRoot = join(root, 'legacy-install');
  await mkdir(bin);
  await mkdir(downloads);
  if (existing) {
    await mkdir(join(installRoot, 'data'), { recursive: true });
    await writeFile(join(installRoot, 'previous-version'), 'keep-me');
    await writeFile(join(installRoot, 'data', 'user-content'), 'must-survive');
  }
  if (legacy) {
    await mkdir(join(legacyRoot, 'data'), { recursive: true });
    await writeFile(join(legacyRoot, 'data', 'legacy-user-content'), 'must-migrate');
  }

  const payload = Buffer.from('not-a-real-zstd-archive\n');
  const actualHash = createHash('sha256').update(payload).digest('hex');
  await writeFile(join(downloads, 'core.tar.zst'), payload);
  const manifest = {
    schema: 1, sequence: 1, channel: 'stable', product: 'SYC-AI',
    version: '0.1.0-preview.2', minimumVersion: '0.1.0-preview.1', mode: 'required',
    issuedAt: '2026-09-20T18:10:00.000Z', expiresAt: '2099-09-21T18:10:00.000Z',
    assets: { core: {
      file: 'core.tar.zst',
      bytes: payload.length,
      sha256: expectedHash === 'actual' ? actualHash : expectedHash,
    } },
  };
  const keys = generateKeyPairSync('ed25519');
  const entitlementKeys = generateKeyPairSync('ed25519');
  await writeFile(join(downloads, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(downloads, 'manifest.sig'), sign(null, canonicalReleaseBytes(manifest), keys.privateKey).toString('base64url'));

  await executable(join(bin, 'id'), '#!/bin/sh\n[ "$1" = "-u" ] && echo 0\n');
  await executable(join(bin, 'node'), `#!/bin/sh
if [ "$1" = "-p" ]; then echo 20; exit 0; fi
if [ "$1" = "-" ]; then exec "${process.execPath}" "$@"; fi
case "$1" in
  */render-service.mjs)
    [ "$4" = core ] && echo "$3.service" || echo "$3-$4.service"
    exit 0
    ;;
esac
exit 0
`);
  await executable(join(bin, 'systemctl'), `#!/bin/sh
printf '%s\n' "$*" >> "${systemctlLog}"
if [ "$1" = "restart" ] && [ "${restartFails ? 'yes' : 'no'}" = yes ]; then exit 1; fi
exit 0
`);
  await executable(join(bin, 'zstd'), '#!/bin/sh\nexit 0\n');
  await executable(join(bin, 'hostname'), '#!/bin/sh\n[ "$1" = "-I" ] && echo 127.0.0.1\n');
  await executable(join(bin, 'curl'), `#!/bin/sh
out=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
cp "${downloads}/$(basename "$url")" "$out"
`);
  await executable(join(bin, 'tar'), `#!/bin/sh
target=""
while [ "$#" -gt 0 ]; do [ "$1" = "-C" ] && { target="$2"; break; }; shift; done
[ -n "$target" ] || exit 2
mkdir -p "$target/scripts" "$target/installer"
printf '%s' "$target" > "${marker}"
exit 0
`);

  return {
    root, bin, installRoot, legacyRoot, marker, systemctlLog,
    publicKeyB64: Buffer.from(keys.publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'),
    entitlementPublicKeyB64: Buffer.from(entitlementKeys.publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'),
  };
}

function runInstaller(f, overrides = {}) {
  return new Promise((resolveRun) => {
    const child = spawn('/bin/bash', [installer], {
      cwd: project,
      env: {
        ...process.env,
        PATH: `${f.bin}:${process.env.PATH}`,
        SYC_YES: '1',
        SYC_SRC: 'https://artifacts.invalid/v-test',
        SYC_ROOT: f.installRoot,
        SYC_PORT: '28782',
        SYC_ADMIN_PASS: 'test-password-only',
        SYC_PREFIX: 'syc-ai-test',
        SYC_RELEASE_PUBLIC_KEY_B64: f.publicKeyB64,
        SYC_ENTITLEMENT_PUBLIC_KEY_B64: f.entitlementPublicKeyB64,
        SYC_CONTROL_URL: 'https://control.example',
        SYC_PUBLIC_ORIGIN: 'https://panel.example',
        SYC_LEGACY_ROOT: f.legacyRoot,
        ...overrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
  });
}

test('rejects a package whose SHA-256 does not match the manifest before extraction', async () => {
  const f = await fixture({ expectedHash: '0'.repeat(64) });
  const result = await runInstaller(f);
  assert.notEqual(result.code, 0, `installer unexpectedly succeeded:\n${result.stdout}\n${result.stderr}`);
  await assert.rejects(() => readFile(f.marker), { code: 'ENOENT' });
  assert.match(`${result.stdout}\n${result.stderr}`, /integrity|sha-?256|checksum/i);
});

test('accepts a package whose size and SHA-256 match the manifest', async () => {
  const f = await fixture({ expectedHash: 'actual' });
  const result = await runInstaller(f);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.notEqual(await readFile(f.marker, 'utf8'), f.installRoot);
});

test('failed service activation restores the previous installation', async () => {
  const f = await fixture({ expectedHash: 'actual', restartFails: true, existing: true });
  const result = await runInstaller(f);
  assert.notEqual(result.code, 0);
  assert.notEqual(await readFile(f.marker, 'utf8'), f.installRoot);
  assert.equal(await readFile(join(f.installRoot, 'previous-version'), 'utf8'), 'keep-me');
});

test('successful upgrade preserves existing user data', async () => {
  const f = await fixture({ expectedHash: 'actual', existing: true });
  const result = await runInstaller(f);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(await readFile(join(f.installRoot, 'data', 'user-content'), 'utf8'), 'must-survive');
  assert.match(await readFile(join(f.installRoot, 'data', 'managed-units'), 'utf8'), /^syc-ai-test\.service$/m);
  assert.equal(await readFile(join(f.installRoot, 'data', 'runtime.env'), 'utf8'), [
    'SYC_AI_CONTROL_URL=https://control.example',
    'SYC_AI_PUBLIC_ORIGIN=https://panel.example',
    `SYC_AI_ENTITLEMENT_PUBLIC_KEY_FILE=${f.installRoot}/data/entitlement-public.pem`,
    `SYC_AI_RELEASE_PUBLIC_KEY_FILE=${f.installRoot}/data/release-public.pem`,
    'SYC_AI_VERSION=0.1.0-preview.2',
    '',
  ].join('\n'));
  assert.match(await readFile(join(f.installRoot, 'data', 'entitlement-public.pem'), 'utf8'), /^-----BEGIN PUBLIC KEY-----/);
  assert.match(await readFile(join(f.installRoot, 'data', 'release-public.pem'), 'utf8'), /^-----BEGIN PUBLIC KEY-----/);
  assert.deepEqual(JSON.parse(await readFile(join(f.installRoot, 'data', 'release.json'), 'utf8')), {
    source: 'https://artifacts.invalid/v-test', flavor: 'core', channel: 'github',
  });
});

test('installer fails closed when central onboarding configuration is absent', async () => {
  const f = await fixture({ expectedHash: 'actual' });
  const result = await runInstaller(f, { SYC_PUBLIC_ORIGIN: '' });
  assert.notEqual(result.code, 0);
  await assert.rejects(() => readFile(f.marker), { code: 'ENOENT' });
  assert.match(`${result.stdout}\n${result.stderr}`, /public origin|onboarding configuration/i);
});

test('installer requires explicit release and control endpoints', async () => {
  const f = await fixture({ expectedHash: 'actual' });
  for (const missing of [
    { SYC_SRC: '' },
    { SYC_CONTROL_URL: '' },
  ]) {
    const result = await runInstaller(f, missing);
    assert.notEqual(result.code, 0);
    await assert.rejects(() => readFile(f.marker), { code: 'ENOENT' });
    assert.match(`${result.stdout}\n${result.stderr}`, /release source|control URL|onboarding configuration/i);
  }
});

test('first current install migrates legacy data and retires the old service without deleting its backup', async () => {
  const f = await fixture({ expectedHash: 'actual', legacy: true });
  const result = await runInstaller(f);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(await readFile(join(f.installRoot, 'data', 'legacy-user-content'), 'utf8'), 'must-migrate');
  assert.equal(await readFile(join(f.legacyRoot, 'data', 'legacy-user-content'), 'utf8'), 'must-migrate');
  assert.match(await readFile(f.systemctlLog, 'utf8'), /^stop syc-free/m);
});

test('uses SYC-AI public naming and the new default install identity', async () => {
  const source = await readFile(installer, 'utf8');
  assert.doesNotMatch(source, /SYC-AI Free/i);
  assert.doesNotMatch(source, /github\.com\/SYCC-AI\/syc-ai-free|https:\/\/dev\.sycc\.ir/);
  assert.match(source, /ROOT="\$\{SYC_ROOT:-\/opt\/syc-ai\}"/);
  assert.match(source, /PREFIX="\$\{SYC_PREFIX:-syc-ai\}"/);
});

test('customer-facing launch files contain no deprecated Free or Normal edition name', async () => {
  const publicFiles = [
    'README.md', 'CONTRIBUTING.md', 'LICENSE', 'public/login.html',
    'public/profile.js', 'installer/panels.json', 'installer/panel-install.sh',
  ];
  for (const file of publicFiles) {
    const source = await readFile(join(project, file), 'utf8');
    assert.doesNotMatch(source, /SYC(?:-AI)?\s+(?:Free|Normal)\b/i, file);
  }
});
