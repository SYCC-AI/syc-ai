// Per-user professional-account apps for the hosted panel (hybrid model, 2026-09-22).
//
// The panel apps (Claude Web, Codex Web, …) were written single-tenant: one
// data directory, one account home, one port. Instead of rewriting them, the
// hosted panel runs one *process per user per app*, each with its own data
// tree under <dataRoot>/users/<username>/<app>/ and its own loopback port,
// started on first use and stopped again after IDLE_MS without a request.
// An idle instance costs ~70 MB, so hundreds of users fit on one box.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chmodSync, existsSync, lchownSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IDLE_MS = Number(process.env.SYC_TENANT_IDLE_MIN || 15) * 60 * 1000;
// Hard ceiling on app processes on this box (each user can have two: Claude
// and Codex). At the ceiling the longest-idle instance is stopped to make room;
// if every instance is mid-request the newcomer is told to retry shortly.
// Sized from the unit's MemoryMax: ~70 MB idle, a few hundred MB while busy.
function maxInstances() { return Math.max(1, Number(process.env.SYC_TENANT_MAX || 120)); }
// Each user's app processes run under their own numeric uid (no passwd entry
// needed), so one customer's process cannot read another customer's files or
// the panel's secrets. Only when the panel itself runs as root.
const ISOLATE = typeof process.getuid === 'function' && process.getuid() === 0 && process.env.SYC_TENANT_SAME_UID !== '1';
const UID_BASE = 200000;
const SETPRIV = '/usr/bin/setpriv';
// Per-user storage on our server (transcripts, settings). Files live on the device.
const QUOTA_BYTES = Number(process.env.SYC_TENANT_QUOTA_MB || 500) * 1024 * 1024;

function treeBytes(path) {
  let st; try { st = lstatSync(path); } catch { return 0; }
  if (!st.isDirectory()) return st.size;
  let total = 0; for (const name of readdirSync(path)) total += treeBytes(join(path, name));
  return total;
}

function chownTree(path, uid) {
  let st;
  try { st = lstatSync(path); } catch { return; }
  if (st.uid !== uid) { try { lchownSync(path, uid, uid); } catch { /* best effort */ } }
  if (st.isDirectory()) for (const name of readdirSync(path)) chownTree(join(path, name), uid);
}
const READY_TIMEOUT_MS = 25_000;
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

async function waitReady(port, path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) return true;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

// What each app needs to run for one user. `dir` is that user's directory
// for the app; `port` the loopback port chosen for this instance.
const APP_TEMPLATES = {
  claude: {
    entry: 'apps/claude/server.mjs',
    health: '/api/health',
    env: ({ dir, port, root, base }) => ({
      CLAUDE_CHAT_PORT: String(port),
      CLAUDE_CHAT_DATA_DIR: join(dir, 'data'),
      CLAUDE_CHAT_WORKSPACE: join(dir, 'workspace'),
      CLAUDE_CHAT_PROJECT_DIR: join(dir, 'workspace'),
      CLAUDE_CHAT_ACCOUNTS_HOME_ROOT: join(dir, 'accounts'),
      HOME: join(dir, 'accounts', 'primary'),
      CLAUDE_BIN: base.CLAUDE_BIN || join(root, 'runtime', 'claude-code', 'bin', 'claude.exe'),
    }),
    dirs: ['data', 'workspace', 'accounts/primary'],
  },
  codex: {
    entry: 'apps/codex/server.mjs',
    health: '/api/health',
    env: ({ dir, port, root, base }) => ({
      CODEX_CHAT_PORT: String(port),
      CODEX_CHAT_DATA_DIR: join(dir, 'data'),
      CODEX_ACCOUNTS_DIR: join(dir, 'accounts'),
      CODEX_CHAT_WORKSPACE: join(dir, 'workspace'),
      CODEX_HOME: join(dir, 'home'),
      HOME: join(dir, 'userhome'),
      CODEX_BIN: base.CODEX_BIN || join(root, 'runtime', 'codex', 'bin', 'codex.js'),
    }),
    dirs: ['data', 'workspace', 'home', 'userhome', 'accounts'],
  },
};

export function createTenantApps({ root, dataRoot, baseEnv = process.env, logger = console, idleMs = IDLE_MS } = {}) {
  if (!root || !dataRoot) throw new TypeError('root and dataRoot are required');
  // key `${username}/${app}` → { port, child, lastUsed, inflight, ready: Promise }
  const instances = new Map();

  // Traverse-only on the parents: a tenant can reach its own directory by path but list nothing.
  // The app code itself must be readable (a release unpacks with umask 077).
  if (ISOLATE) {
    for (const dir of [root, dataRoot, join(dataRoot, 'users')]) { try { mkdirSync(dir, { recursive: true }); chmodSync(dir, 0o711); } catch { /* best effort */ } }
    const openRead = (path) => {
      let st; try { st = lstatSync(path); } catch { return; }
      if (st.isSymbolicLink()) return;
      const mode = st.mode & 0o7777;
      const want = st.isDirectory() ? (mode | 0o055) : (mode | 0o044);
      if (want !== mode) { try { chmodSync(path, want); } catch { /* best effort */ } }
      if (st.isDirectory()) for (const name of readdirSync(path)) openRead(join(path, name));
    };
    openRead(join(root, 'apps'));
  }

  function tenantUid(username) {
    const file = join(dataRoot, 'users', username, '.uid');
    try { const saved = Number(readFileSync(file, 'utf8')); if (saved > UID_BASE) return saved; } catch { /* first start */ }
    let max = UID_BASE;
    for (const name of readdirSync(join(dataRoot, 'users'))) {
      try { max = Math.max(max, Number(readFileSync(join(dataRoot, 'users', name, '.uid'), 'utf8')) || 0); } catch { /* none */ }
    }
    const uid = max + 1;
    mkdirSync(join(dataRoot, 'users', username), { recursive: true });
    writeFileSync(file, `${uid}\n`, { mode: 0o600 });
    return uid;
  }

  function userDir(username, app) {
    if (!SAFE_NAME.test(username)) throw Object.assign(new Error('invalid_username'), { status: 400 });
    return join(dataRoot, 'users', username, app);
  }

  async function start(username, app) {
    const template = APP_TEMPLATES[app];
    if (!template) throw Object.assign(new Error('unknown_app'), { status: 404 });
    const dir = userDir(username, app);
    for (const sub of template.dirs) mkdirSync(join(dir, sub), { recursive: true, mode: 0o700 });
    const port = await freePort();
    const env = {
      ...baseEnv,
      ...template.env({ dir, port, root, base: baseEnv }),
      SYC_TENANT_USER: username,
      SYC_HUB_BASE: baseEnv.SYC_HUB_BASE || 'http://127.0.0.1:8798',
      TERM: 'xterm-256color',
      NODE_ENV: baseEnv.NODE_ENV || 'production',
    };
    let ids = {};
    if (ISOLATE) {
      for (const dir of [root, dataRoot, join(dataRoot, 'users')]) { try { chmodSync(dir, 0o711); } catch { /* best effort */ } }
      const uid = tenantUid(username);
      const home = join(dataRoot, 'users', username);
      chownTree(join(home, app), uid);
      try { lchownSync(home, uid, uid); chmodSync(home, 0o700); } catch { /* best effort */ }
      ids = { uid, gid: uid };
    }
    // setpriv drops to the tenant uid with no-new-privs, so nothing the tenant
    // runs can regain root (the core itself needs CAP_SETUID to do this).
    const child = ids.uid && existsSync(SETPRIV)
      ? spawn(SETPRIV, ['--no-new-privs', `--reuid=${ids.uid}`, `--regid=${ids.gid}`, '--clear-groups', '--', process.execPath, join(root, template.entry)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(process.execPath, [join(root, template.entry)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], ...ids });
    const tag = `[tenant ${username}/${app}:${port}]`;
    child.stdout.on('data', (c) => { for (const line of c.toString().trim().split('\n')) if (line) logger.log(`${tag} ${line}`); });
    child.stderr.on('data', (c) => { for (const line of c.toString().trim().split('\n')) if (line) logger.error(`${tag} ${line}`); });
    const instance = { username, app, port, child, startedAt: Date.now(), lastUsed: Date.now(), inflight: 0, ready: null };
    instance.ready = waitReady(port, template.health, READY_TIMEOUT_MS).then((ok) => {
      if (!ok) { try { child.kill('SIGKILL'); } catch { /* gone */ } throw Object.assign(new Error('app_start_timeout'), { status: 502 }); }
      return instance;
    });
    child.on('close', (code, signal) => {
      logger.log(`${tag} exited (${code ?? signal})`);
      if (instances.get(`${username}/${app}`) === instance) instances.delete(`${username}/${app}`);
    });
    return instance;
  }

  // Measured at most every 10 minutes per user so a request never waits on it.
  const usage = new Map(); // username → { at, bytes }
  function usageOf(username) {
    const hit = usage.get(username);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.bytes;
    const bytes = SAFE_NAME.test(username) ? treeBytes(join(dataRoot, 'users', username)) : 0;
    usage.set(username, { at: Date.now(), bytes });
    return bytes;
  }

  // Stop the instance that has been idle the longest; refuse when none is idle.
  function makeRoom() {
    let victim = null;
    for (const [key, instance] of instances) {
      if (instance.inflight > 0) continue;
      if (!victim || instance.lastUsed < victim[1].lastUsed) victim = [key, instance];
    }
    if (!victim) {
      throw Object.assign(new Error('capacity_full: every workspace on this server is busy right now; please try again in a minute'), { status: 503, retryAfter: 60 });
    }
    logger.log(`[tenant ${victim[0]}] stopped to make room (${instances.size} running, ceiling ${maxInstances()})`);
    instances.delete(victim[0]);
    try { victim[1].child.kill('SIGTERM'); } catch { /* gone */ }
  }

  const reaper = setInterval(() => {
    const now = Date.now();
    for (const [key, instance] of instances) {
      if (instance.inflight === 0 && now - instance.lastUsed > idleMs) {
        logger.log(`[tenant ${key}] idle for ${Math.round((now - instance.lastUsed) / 60000)} min; stopping`);
        instances.delete(key);
        try { instance.child.kill('SIGTERM'); } catch { /* gone */ }
      }
    }
  }, 60_000);
  reaper.unref?.();

  return Object.freeze({
    // Returns the loopback port of the user's running instance, starting it if needed.
    async acquire(username, app) {
      const key = `${username}/${app}`;
      const usage = usageOf(username);
      if (usage > QUOTA_BYTES) throw Object.assign(new Error(`storage_quota_exceeded (${Math.round(usage / 1048576)} MB of ${Math.round(QUOTA_BYTES / 1048576)} MB)`), { status: 507 });
      let instance = instances.get(key);
      if (!instance) {
        if (instances.size >= maxInstances()) makeRoom();
        instance = await start(username, app);
        instances.set(key, instance);
      }
      try { await instance.ready; } catch (error) { instances.delete(key); throw error; }
      instance.lastUsed = Date.now();
      instance.inflight += 1;
      return { port: instance.port, release: () => { instance.inflight = Math.max(0, instance.inflight - 1); instance.lastUsed = Date.now(); } };
    },
    list: () => [...instances.values()].map((i) => ({ username: i.username, app: i.app, port: i.port, pid: i.child.pid, startedAt: i.startedAt, lastUsed: i.lastUsed, inflight: i.inflight })),
    stopAll() {
      clearInterval(reaper);
      for (const [key, instance] of instances) { instances.delete(key); try { instance.child.kill('SIGTERM'); } catch { /* gone */ } }
    },
    userDir,
    usageOf,
    apps: Object.keys(APP_TEMPLATES),
    exists: (username, app) => existsSync(userDir(username, app)),
  });
}
