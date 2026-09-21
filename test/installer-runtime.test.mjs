import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createInstallerRuntime } from '../installer-runtime.mjs';
import { canonicalReleaseBytes } from '../release-metadata.mjs';

async function fixture({ tamper = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'syc-panel-runtime-'));
  await mkdir(join(root, 'installer'), { recursive: true });
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'installer', 'panels.json'), JSON.stringify({
    panels: { claude: { name: 'Claude', order: 1, port: 8786 } },
  }));
  await writeFile(join(root, 'installer', 'panel-install.sh'), '# test installer\n');
  await writeFile(join(root, 'data', 'release.json'), JSON.stringify({
    source: 'https://releases.example/v0.5.0', flavor: 'core', channel: 'direct',
  }));
  const keys = generateKeyPairSync('ed25519');
  await writeFile(join(root, 'data', 'release-public.pem'), keys.publicKey.export({ type: 'spki', format: 'pem' }));
  const archive = Buffer.from('authentic panel archive');
  const metadata = {
    schema: 1, sequence: 21, channel: 'stable', version: '0.5.0',
    issuedAt: '2026-09-21T00:00:00.000Z', expiresAt: '2099-09-22T00:00:00.000Z',
    minimumVersion: '0.5.0', mode: 'optional', assets: {},
    panels: { claude: {
      file: 'panel-claude.tar.zst', bytes: archive.length,
      sha256: createHash('sha256').update(archive).digest('hex'),
    } },
  };
  const signed = tamper ? { ...metadata, sequence: 22 } : metadata;
  const signature = sign(null, canonicalReleaseBytes(metadata), keys.privateKey).toString('base64url');
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    if (String(url).endsWith('/manifest.json')) return new Response(JSON.stringify(signed), { status: 200 });
    if (String(url).endsWith('/manifest.sig')) return new Response(`${signature}\n`, { status: 200 });
    return new Response(archive, { status: 200, headers: { 'content-length': String(archive.length) } });
  };
  const spawned = [];
  const spawnImpl = (...args) => {
    spawned.push(args);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => child.emit('close', 0));
    return child;
  };
  const events = [];
  const res = {
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    write(chunk) { events.push(String(chunk)); },
    end() { this.ended = true; },
  };
  return { root, fetched, spawned, events, res, fetchImpl, spawnImpl, signature };
}

test('in-panel install requires signed metadata and records its release sequence', async () => {
  const f = await fixture();
  const runtime = createInstallerRuntime({ root: f.root, fetchImpl: f.fetchImpl, spawnImpl: f.spawnImpl });
  await runtime.installPanelStream('claude', f.res);
  assert.equal(f.res.status, 200);
  assert.equal(f.res.ended, true);
  assert.deepEqual(f.fetched, [
    'https://releases.example/v0.5.0/manifest.json',
    'https://releases.example/v0.5.0/manifest.sig',
    'https://releases.example/v0.5.0/panel-claude.tar.zst',
  ]);
  assert.equal(f.spawned.length, 1);
  assert.match(f.events.join(''), /event: done/);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'data', 'release-state.json'), 'utf8')), {
    sequence: 21, version: '0.5.0',
  });
});

test('in-panel install rejects tampered metadata before downloading or spawning', async () => {
  const f = await fixture({ tamper: true });
  const runtime = createInstallerRuntime({ root: f.root, fetchImpl: f.fetchImpl, spawnImpl: f.spawnImpl });
  await runtime.installPanelStream('claude', f.res);
  assert.equal(f.spawned.length, 0);
  assert.equal(f.fetched.length, 2);
  assert.match(f.events.join(''), /event: error/);
  assert.doesNotMatch(f.events.join(''), /authentic panel archive/);
  assert.equal(f.events.join('').includes(f.signature), false);
});
