import assert from 'node:assert/strict';
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const project = resolve(import.meta.dirname, '..');
const manager = join(project, 'installer', 'manage-installation.sh');

async function executable(path, body) {
  await writeFile(path, body, { mode: 0o755 });
  await chmod(path, 0o755);
}

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'syc-ai-lifecycle-'));
  const root = join(base, 'install');
  const backup = join(base, 'uninstalled-backup');
  const bin = join(base, 'bin');
  const systemd = join(base, 'systemd');
  const log = join(base, 'systemctl.log');
  await mkdir(join(root, 'data'), { recursive: true });
  await mkdir(join(root, 'installer'), { recursive: true });
  await mkdir(bin);
  await mkdir(systemd);
  await writeFile(join(root, 'data', 'install-prefix'), 'syc-ai-test\n');
  await writeFile(join(root, 'data', 'installed-panels'), 'codex\n');
  await writeFile(join(root, 'data', 'managed-units'), 'syc-ai-test.service\nsyc-ai-test-codex.service\n');
  await writeFile(join(root, 'data', 'user-content'), 'must-survive');
  await writeFile(join(root, 'installer', 'panels.json'), JSON.stringify({ panels: { codex: {} } }));
  await writeFile(join(root, 'installer', 'render-service.mjs'), '// fixture');
  await writeFile(join(systemd, 'syc-ai-test.service'), 'core');
  await writeFile(join(systemd, 'syc-ai-test-codex.service'), 'codex');
  await writeFile(join(systemd, 'unrelated.service'), 'keep');
  await executable(join(bin, 'id'), '#!/bin/sh\n[ "$1" = "-u" ] && echo 0\n');
  await executable(join(bin, 'node'), '#!/bin/sh\nprefix="$3"\ntarget="$4"\n[ "$target" = core ] && echo "$prefix.service" || echo "$prefix-$target.service"\n');
  await executable(join(bin, 'systemctl'), `#!/bin/sh
printf '%s\n' "$*" >> "${log}"
exit 0
`);
  return { base, root, backup, bin, systemd, log };
}

function run(action, fixture) {
  return new Promise((resolveRun) => {
    const child = spawn('/bin/bash', [manager, action], {
      cwd: project,
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        SYC_ROOT: fixture.root,
        SYC_SYSTEMD_DIR: fixture.systemd,
        SYC_UNINSTALL_BACKUP: fixture.backup,
        SYC_CONFIRM_UNINSTALL: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolveRun({ code, output }));
  });
}

test('repair recreates only registered services and preserves user data', async () => {
  const f = await fixture();
  const result = await run('repair', f);
  assert.equal(result.code, 0, result.output);
  assert.equal(await readFile(join(f.root, 'data', 'user-content'), 'utf8'), 'must-survive');
  const log = await readFile(f.log, 'utf8');
  assert.match(log, /daemon-reload/);
  assert.match(log, /restart syc-ai-test\.service/);
  assert.match(log, /restart syc-ai-test-codex\.service/);
});

test('safe uninstall moves the installation to an explicit backup and removes only owned units', async () => {
  const f = await fixture();
  const result = await run('uninstall', f);
  assert.equal(result.code, 0, result.output);
  await assert.rejects(access(f.root), { code: 'ENOENT' });
  assert.equal(await readFile(join(f.backup, 'data', 'user-content'), 'utf8'), 'must-survive');
  await assert.rejects(access(join(f.systemd, 'syc-ai-test.service')), { code: 'ENOENT' });
  await assert.rejects(access(join(f.systemd, 'syc-ai-test-codex.service')), { code: 'ENOENT' });
  assert.equal(await readFile(join(f.systemd, 'unrelated.service'), 'utf8'), 'keep');
});

test('core release package includes the lifecycle manager', async () => {
  const registry = JSON.parse(await readFile(join(project, 'installer', 'panels.json'), 'utf8'));
  assert.ok(registry.core.include.includes('installer/manage-installation.sh'));
});
