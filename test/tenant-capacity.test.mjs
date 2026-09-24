import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// A stand-in for Claude Web: answers its health path on the port it is given.
const FAKE_APP = `import { createServer } from 'node:http';
createServer((q, s) => { s.end('ok'); }).listen(Number(process.env.CLAUDE_CHAT_PORT || process.env.CODEX_CHAT_PORT), '127.0.0.1');`;

async function fixture({ max = 2, idleMs = 60_000 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'syc-tenant-cap-'));
  for (const app of ['claude', 'codex']) {
    await mkdir(join(root, 'apps', app), { recursive: true });
    await writeFile(join(root, 'apps', app, 'server.mjs'), FAKE_APP);
  }
  process.env.SYC_TENANT_SAME_UID = '1';
  process.env.SYC_TENANT_MAX = String(max);
  const { createTenantApps } = await import(`../tenant-apps.mjs?cap=${Math.random()}`);
  const tenants = createTenantApps({ root, dataRoot: join(root, 'data'), logger: { log() {}, error() {} }, idleMs });
  return { tenants };
}

test('when the box is full, the longest-idle user makes room instead of the panel running out of memory', async (t) => {
  const { tenants } = await fixture({ max: 2 });
  t.after(() => tenants.stopAll());
  const a = await tenants.acquire('alice', 'claude'); a.release();
  const b = await tenants.acquire('bob', 'claude'); b.release();
  // Nobody is mid-request, so a third user evicts the one idle the longest (alice).
  const c = await tenants.acquire('carol', 'claude'); c.release();
  const running = tenants.list().map((i) => i.username).sort();
  assert.deepEqual(running, ['bob', 'carol']);
});

test('when every slot is busy, a new user gets a clear "full, try again shortly" answer', async (t) => {
  const { tenants } = await fixture({ max: 1 });
  t.after(() => tenants.stopAll());
  const busy = await tenants.acquire('alice', 'claude'); // stays in flight
  await assert.rejects(tenants.acquire('bob', 'claude'), (error) => error.status === 503 && /capacity/.test(error.message));
  busy.release();
});
