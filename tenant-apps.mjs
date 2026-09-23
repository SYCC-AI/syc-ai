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
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const IDLE_MS = 30 * 60 * 1000;
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
    const child = spawn(process.execPath, [join(root, template.entry)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
      let instance = instances.get(key);
      if (!instance) { instance = await start(username, app); instances.set(key, instance); }
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
    apps: Object.keys(APP_TEMPLATES),
    exists: (username, app) => existsSync(userDir(username, app)),
  });
}
