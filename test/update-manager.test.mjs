import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalReleaseBytes } from '../release-metadata.mjs';
import { applyUpdate } from '../update-manager.mjs';

async function fixture({ health = true, sequence = 2 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'syc-ai-update-'));
  const root = join(directory, 'current');
  await mkdir(root);
  await writeFile(join(root, 'version'), 'old');
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'data', 'user-content'), 'must-survive');
  const payload = Buffer.from('signed archive bytes');
  const keys = generateKeyPairSync('ed25519');
  const metadata = {
    schema: 1, sequence, channel: 'stable', version: '0.1.0-preview.2',
    issuedAt: '2026-09-20T18:00:00.000Z', expiresAt: '2099-09-21T18:00:00.000Z',
    minimumVersion: '0.1.0-preview.1', mode: 'required',
    assets: { core: { file: 'core.tar.zst', bytes: payload.length, sha256: createHash('sha256').update(payload).digest('hex') } },
  };
  const signature = sign(null, canonicalReleaseBytes(metadata), keys.privateKey).toString('base64url');
  return { directory, root, payload, metadata, signature, publicKey: keys.publicKey, health };
}

test('update verifies metadata and archive before atomic activation', async () => {
  const f = await fixture({ health: true });
  const result = await applyUpdate({
    root: f.root, stateFile: join(f.directory, 'state.json'), metadata: f.metadata,
    signature: f.signature, publicKey: f.publicKey, asset: 'core',
    download: async () => f.payload,
    extract: async (_archive, stage) => writeFile(join(stage, 'version'), 'new'),
    healthCheck: async () => f.health,
  });
  assert.equal(result.version, '0.1.0-preview.2');
  assert.equal(await readFile(join(f.root, 'version'), 'utf8'), 'new');
  assert.equal(await readFile(join(f.root, 'data', 'user-content'), 'utf8'), 'must-survive');
  assert.equal(JSON.parse(await readFile(join(f.directory, 'state.json'))).sequence, 2);
});

test('an update carries the installed professional accounts across, it does not uninstall them', async () => {
  const f = await fixture({ health: true });
  // What the in-panel installer put into this root: a core release archive
  // knows nothing about either tree.
  await mkdir(join(f.root, 'apps', 'claude'), { recursive: true });
  await writeFile(join(f.root, 'apps', 'claude', 'app.mjs'), 'installed');
  await mkdir(join(f.root, 'runtime', 'claude-code'), { recursive: true });
  await writeFile(join(f.root, 'runtime', 'claude-code', 'cli'), 'binary');

  await applyUpdate({
    root: f.root, stateFile: join(f.directory, 'state.json'), metadata: f.metadata,
    signature: f.signature, publicKey: f.publicKey, asset: 'core',
    preserve: ['data', 'apps', 'runtime'],
    download: async () => f.payload,
    extract: async (_archive, stage) => writeFile(join(stage, 'version'), 'new'),
    healthCheck: async () => true,
  });
  assert.equal(await readFile(join(f.root, 'version'), 'utf8'), 'new');
  assert.equal(await readFile(join(f.root, 'apps', 'claude', 'app.mjs'), 'utf8'), 'installed');
  assert.equal(await readFile(join(f.root, 'runtime', 'claude-code', 'cli'), 'utf8'), 'binary');
  assert.equal(await readFile(join(f.root, 'data', 'user-content'), 'utf8'), 'must-survive');
});

test('failed health check restores prior installation and replay is rejected', async () => {
  const f = await fixture({ health: false });
  await assert.rejects(applyUpdate({
    root: f.root, stateFile: join(f.directory, 'state.json'), metadata: f.metadata,
    signature: f.signature, publicKey: f.publicKey, asset: 'core',
    download: async () => f.payload,
    extract: async (_archive, stage) => writeFile(join(stage, 'version'), 'bad'),
    healthCheck: async () => false,
  }), /health/);
  assert.equal(await readFile(join(f.root, 'version'), 'utf8'), 'old');
  await writeFile(join(f.directory, 'state.json'), JSON.stringify({ sequence: 2 }));
  await assert.rejects(applyUpdate({
    root: f.root, stateFile: join(f.directory, 'state.json'), metadata: f.metadata,
    signature: f.signature, publicKey: f.publicKey, asset: 'core',
    download: async () => f.payload, extract: async () => {}, healthCheck: async () => true,
  }), /sequence/);
});
