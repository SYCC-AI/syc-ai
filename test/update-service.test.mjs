import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalReleaseBytes } from '../release-metadata.mjs';
import { createUpdateService } from '../update-service.mjs';

const NOW = Date.parse('2026-09-21T12:00:00Z');

function release({ sequence, version, mode, payload, keys }) {
  const metadata = {
    schema: 1, sequence, channel: 'stable', version, mode,
    issuedAt: '2026-09-21T10:00:00.000Z', expiresAt: '2099-09-21T10:00:00.000Z',
    minimumVersion: '0.1.0-preview.1',
    assets: {
      core: {
        file: `core-${version}.tar.zst`,
        bytes: payload.length,
        sha256: createHash('sha256').update(payload).digest('hex'),
      },
    },
  };
  return {
    metadata,
    signature: sign(null, canonicalReleaseBytes(metadata), keys.privateKey).toString('base64url'),
  };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'syc-ai-update-service-'));
  const root = join(directory, 'current');
  await mkdir(root);
  await writeFile(join(root, 'version'), 'v1');
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'data', 'user-content'), 'must-survive');
  const keys = generateKeyPairSync('ed25519');
  const signerKeys = generateKeyPairSync('ed25519');

  let offered = { available: false };
  let healthy = true;
  const payloads = new Map();
  const calls = [];
  const logged = [];

  const controlClient = {
    async call(operation, options) {
      calls.push({ operation, options });
      if (operation !== 'releaseCurrent') throw new Error(`unexpected operation ${operation}`);
      if (offered instanceof Error) throw offered;
      return { status: 200, body: { data: offered }, setCookies: [] };
    },
  };
  const activation = {
    async signer() {
      return {
        installationId: '9f1c4d2e-7a3b-4c5d-8e9f-0a1b2c3d4e5f',
        sign: (message) => sign(null, Buffer.from(message), signerKeys.privateKey).toString('base64url'),
      };
    },
  };

  function serve({ sequence, version, mode }) {
    const payload = Buffer.from(`archive for ${version}`);
    payloads.set(`core-${version}.tar.zst`, payload);
    const signed = release({ sequence, version, mode, payload, keys });
    offered = {
      available: true,
      sequence,
      version,
      channel: 'stable',
      mode,
      minimumVersion: '0.1.0-preview.1',
      manifest: signed.metadata,
      signature: signed.signature,
    };
    return signed;
  }

  const service = createUpdateService({
    activation,
    controlClient,
    releasePublicKey: keys.publicKey,
    root,
    stateFile: join(directory, 'update-state.json'),
    downloadAsset: async (descriptor) => payloads.get(descriptor.file),
    extract: async (_archive, stage) => {
      await writeFile(join(stage, 'version'), healthy ? 'new' : 'broken');
    },
    healthCheck: async () => healthy,
    now: () => NOW,
    logger: { log: (line) => logged.push(line), error: (line) => logged.push(line) },
  });

  return {
    service, root, directory, keys, calls, logged,
    serve,
    offer: (value) => { offered = value; },
    none: () => { offered = { available: false }; },
    fail: (error) => { offered = error; },
    setHealthy: (value) => { healthy = value; },
  };
}

test('a required release is applied by the panel itself, without a user session', async () => {
  const f = await fixture();
  assert.equal((await f.service.check()).available, null);

  f.serve({ sequence: 11, version: '0.1.0-preview.2', mode: 'required' });
  const status = await f.service.check();
  assert.equal(status.installedSequence, 11);
  assert.equal(status.restricted, false);
  assert.equal(await readFile(join(f.root, 'version'), 'utf8'), 'new');
  assert.equal(await readFile(join(f.root, 'data', 'user-content'), 'utf8'), 'must-survive');

  // The request was signed by the installation and carried no session cookie.
  const signed = f.calls.at(-1).options.installation;
  assert.equal(signed.installationId, '9f1c4d2e-7a3b-4c5d-8e9f-0a1b2c3d4e5f');
  assert.equal(typeof signed.sign, 'function');
});

test('an optional release is offered, never installed behind the owner', async () => {
  const f = await fixture();
  f.serve({ sequence: 11, version: '0.1.0-preview.2', mode: 'optional' });
  const status = await f.service.check();
  assert.deepEqual(status.available, { sequence: 11, version: '0.1.0-preview.2', mode: 'optional' });
  assert.equal(status.installedSequence, 0);
  assert.equal(status.restricted, false);
  assert.equal(await readFile(join(f.root, 'version'), 'utf8'), 'v1');
});

test('a broken required release rolls back and leaves the panel restricted, not silently stale', async () => {
  const f = await fixture();
  f.serve({ sequence: 11, version: '0.1.0-preview.2', mode: 'required' });
  await f.service.check();

  f.setHealthy(false);
  f.serve({ sequence: 12, version: '0.1.0-preview.3', mode: 'emergency' });
  const status = await f.service.check();
  assert.equal(status.restricted, true);
  assert.equal(status.reason, 'update_required');
  assert.equal(status.installedSequence, 11, 'the working release stays installed');
  assert.equal(await readFile(join(f.root, 'version'), 'utf8'), 'new');
  assert.equal(await readFile(join(f.root, 'data', 'user-content'), 'utf8'), 'must-survive');
  assert.equal(f.service.restricted(), true);

  // Once a healthy replacement is published the panel recovers by itself.
  f.setHealthy(true);
  f.serve({ sequence: 13, version: '0.1.0-preview.4', mode: 'emergency' });
  const recovered = await f.service.check();
  assert.equal(recovered.restricted, false);
  assert.equal(recovered.installedSequence, 13);
});

test('a forged or unsigned release is refused and never reaches the installation', async () => {
  const f = await fixture();
  f.serve({ sequence: 11, version: '0.1.0-preview.2', mode: 'required' });
  await f.service.check();
  assert.equal(f.service.status().installedSequence, 11);

  // A newer, higher-sequence emergency release signed by a key we do not pin.
  const stranger = generateKeyPairSync('ed25519');
  const payload = Buffer.from('hostile archive');
  const forged = release({ sequence: 99, version: '9.9.9', mode: 'emergency', payload, keys: stranger });
  f.offer({
    available: true, sequence: 99, version: '9.9.9', channel: 'stable', mode: 'emergency',
    minimumVersion: '0.1.0-preview.1', manifest: forged.metadata, signature: forged.signature,
  });
  await assert.rejects(f.service.check(), /signature/);
  assert.equal(f.service.status().installedSequence, 11);
  assert.equal(await readFile(join(f.root, 'version'), 'utf8'), 'new');

  // A manifest with its signature stripped fares no better.
  f.offer({
    available: true, sequence: 99, version: '9.9.9', channel: 'stable', mode: 'emergency',
    minimumVersion: '0.1.0-preview.1', manifest: forged.metadata, signature: '',
  });
  await assert.rejects(f.service.check(), /signature/);
  assert.equal(f.service.status().installedSequence, 11);
});

test('a control plane that cannot be reached leaves the panel alone', async () => {
  const f = await fixture();
  f.serve({ sequence: 11, version: '0.1.0-preview.2', mode: 'required' });
  await f.service.check();

  f.fail(Object.assign(new Error('control_unavailable'), { code: 'control_unavailable' }));
  await assert.rejects(f.service.check(), /control_unavailable/);
  assert.equal(f.service.status().installedSequence, 11);
  assert.equal(f.service.restricted(), false, 'an unreachable control plane must not lock the panel');
});
