// Hosted panel: install and sign in professional accounts on the customer's own
// device through the SYC-AI hub. Nothing here runs on our server; every command
// is spawned by the customer's SYC Node agent under the customer's own login.
import { hubDevices, spawnOnDevice } from './remote-runner.mjs';

export const DEVICE_ACCOUNTS = Object.freeze({
  claude: {
    name: 'Claude', bin: 'claude', pkg: '@anthropic-ai/claude-code',
    status: ['auth', 'status'],
    loggedIn: (out, code) => code === 0 && /"loggedIn"\s*:\s*true/.test(out),
    login: ['auth', 'login', '--claudeai'],
    urlRe: /(https:\/\/claude\.(?:com|ai)\/[^\s"']*oauth\/authorize\?[^\s"']+)/,
    needsCode: true,
  },
  codex: {
    name: 'Codex', bin: 'codex', pkg: '@openai/codex',
    status: ['login', 'status'],
    loggedIn: (out, code) => code === 0 && /logged in/i.test(out) && !/not logged in/i.test(out),
    login: ['login', '--device-auth'],
    urlRe: /(https:\/\/auth\.openai\.com\/[^\s"'\u001b]+)/,
    codeRe: /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/,
    needsCode: false,
  },
  // Install only for now: sign-in and the panel for these come later.
  gemini: { name: 'Gemini', bin: 'gemini', pkg: '@google/gemini-cli', installOnly: true },
  cursor: {
    name: 'Cursor', bin: 'cursor-agent', installOnly: true,
    installer: (platform) => (platform === 'windows' ? null : { bin: 'bash', args: ['-lc', 'curl -fsSL https://cursor.com/install | bash'] }),
  },
  kimi: { name: 'Kimi', bin: 'kimi', pkg: '@moonshot-ai/kimi-code', installOnly: true },
});

const strip = (text) => String(text).replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

// Run to completion; resolves {code, out, missing}. `missing` = the binary is not on the device.
export function runOnDevice(deviceId, bin, args, { timeoutMs = 60_000, onOutput, env } = {}) {
  return new Promise((resolve) => {
    const child = spawnOnDevice(deviceId, { bin, args, timeoutMs, env });
    let out = ''; let failed = '';
    const take = (chunk) => { const text = strip(chunk.toString('utf8')); out += text; onOutput?.(text); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('error', (error) => { failed = error.message || 'error'; });
    child.on('close', (code) => {
      const missing = /ENOENT|not recognized|command not found|No such file/i.test(`${failed}\n${out}`) && code !== 0;
      resolve({ code, out, missing, error: child.spawnError || (code == null ? failed || 'device_unavailable' : '') });
    });
  });
}

export async function devicesFor(username) {
  return (await hubDevices()).filter((device) => device.username === username);
}

async function ownedDevice(username, deviceId) {
  const device = (await devicesFor(username)).find((d) => d.deviceId === deviceId);
  if (!device) throw Object.assign(new Error('device_not_found'), { status: 404 });
  return device;
}

// A second account of Claude or Codex (personal and work, say): the same
// program, its sign-in kept in its own folder under ~/.syc-node/accounts/
// (SYC Node 0.7.1+). The user picks which one a session uses; nothing here
// ever moves a session from one account to the other on its own.
export const SECOND_ACCOUNTS = Object.freeze({ 'claude-2': 'claude', 'codex-2': 'codex' });
export function accountEnv(app) {
  if (app === 'claude-2') return { CLAUDE_CONFIG_DIR: '~/.syc-node/accounts/claude-2' };
  if (app === 'codex-2') return { CODEX_HOME: '~/.syc-node/accounts/codex-2' };
  return undefined;
}

// An older SYC Node ignores the account folder and would sign the FIRST
// account in again — so a second account needs 0.7.1 or newer.
const versionAtLeast = (have, want) => {
  const a = String(have || '0').split('.').map(Number); const b = want.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
  return true;
};
export const secondAccountReady = (device) => versionAtLeast(device?.agentVersion, '0.7.1');

function account(app) {
  const spec = DEVICE_ACCOUNTS[SECOND_ACCOUNTS[app] || app];
  if (!spec) throw Object.assign(new Error('unknown_account'), { status: 404 });
  return spec;
}

const statusCache = new Map(); // `${deviceId}/${app}` → { at, value }

const probing = new Map(); // key → Promise

// Page loads never wait on the device: a cached answer (even an old one) comes
// back at once and a fresh probe runs behind it; with nothing cached the answer
// is {checking:true} and the page asks again.
export async function accountStatusQuick(username, deviceId, app) {
  const key = `${deviceId}/${app}`;
  const hit = statusCache.get(key);
  if (!hit || Date.now() - hit.at > 5 * 60_000) {
    if (!probing.has(key)) probing.set(key, accountStatus(username, deviceId, app, { fresh: true }).catch(() => null).finally(() => probing.delete(key)));
  }
  return hit ? hit.value : { app, checking: true };
}

export async function accountStatus(username, deviceId, app, { fresh = false } = {}) {
  const device = await ownedDevice(username, deviceId);
  const spec = account(app);
  if (SECOND_ACCOUNTS[app] && !secondAccountReady(device)) return { app, installed: null, loggedIn: false, needsNodeUpdate: true };
  const key = `${deviceId}/${app}`;
  const hit = statusCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const version = await runOnDevice(deviceId, spec.bin, ['--version'], { timeoutMs: 30_000 });
  let value;
  if (version.error && !version.missing) value = { app, installed: null, loggedIn: null, error: version.error };
  else if (version.missing || version.code !== 0) value = { app, installed: false, loggedIn: false };
  else if (spec.installOnly) {
    value = { app, installed: true, version: version.out.trim().split('\n')[0].slice(0, 60), loggedIn: null, installOnly: true };
  } else {
    const status = await runOnDevice(deviceId, spec.bin, spec.status, { timeoutMs: 30_000, env: accountEnv(app) });
    value = { app, installed: true, version: version.out.trim().split('\n')[0].slice(0, 60), loggedIn: spec.loggedIn(status.out, status.code) };
  }
  statusCache.set(key, { at: Date.now(), value });
  return value;
}

// npm into ~/.syc-node/npm (no root needed; SYC Node 0.4+ puts it on PATH).
export async function installAccount(username, deviceId, app, onOutput) {
  const device = await ownedDevice(username, deviceId);
  const spec = account(app);
  statusCache.delete(`${deviceId}/${app}`);
  if (spec.installer) {
    const command = spec.installer(device.platform);
    if (!command) throw Object.assign(new Error('not_available_on_this_platform'), { status: 409 });
    const done = await runOnDevice(deviceId, command.bin, command.args, { timeoutMs: 15 * 60_000, onOutput });
    if (done.code !== 0) throw Object.assign(new Error(done.error || 'install_failed'), { status: 502, detail: done.out.slice(-800) });
    return accountStatus(username, deviceId, app, { fresh: true });
  }
  const npm = await runOnDevice(deviceId, 'npm', ['--version'], { timeoutMs: 30_000 });
  if (npm.missing) throw Object.assign(new Error('npm_missing'), { status: 409 });
  const result = await runOnDevice(deviceId, 'npm', ['install', '-g', '--prefix', '~/.syc-node/npm', `${spec.pkg}@latest`], { timeoutMs: 15 * 60_000, onOutput });
  if (result.code !== 0) throw Object.assign(new Error(result.error || 'install_failed'), { status: 502, detail: result.out.slice(-800) });
  return accountStatus(username, deviceId, app, { fresh: true });
}

const logins = new Map(); // loginId → { username, deviceId, app, child, out, done, startedAt }

export async function startLogin(username, deviceId, app) {
  const device = await ownedDevice(username, deviceId);
  const spec = account(app);
  if (SECOND_ACCOUNTS[app] && !secondAccountReady(device)) throw Object.assign(new Error('update_syc_node'), { status: 409 });
  if (spec.installOnly) throw Object.assign(new Error('sign_in_not_available_yet'), { status: 409 });
  statusCache.delete(`${deviceId}/${app}`);
  const child = spawnOnDevice(deviceId, { bin: spec.bin, args: spec.login, timeoutMs: 15 * 60_000, env: accountEnv(app) });
  const loginId = crypto.randomUUID();
  const entry = { username, deviceId, app, child, out: '', done: false, code: null, startedAt: Date.now() };
  logins.set(loginId, entry);
  const take = (chunk) => { entry.out += strip(chunk.toString('utf8')); };
  child.stdout.on('data', take); child.stderr.on('data', take);
  child.on('error', () => {});
  child.on('close', (code) => { entry.done = true; entry.code = code; setTimeout(() => logins.delete(loginId), 10 * 60_000).unref?.(); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !entry.done) {
    const url = spec.urlRe.exec(entry.out)?.[1];
    const userCode = spec.codeRe ? spec.codeRe.exec(entry.out)?.[1] : null;
    if (url && (!spec.codeRe || userCode)) return { loginId, url, userCode, needsCode: spec.needsCode };
    await new Promise((r) => setTimeout(r, 300));
  }
  try { child.kill(); } catch {}
  throw Object.assign(new Error(entry.done ? 'login_exited' : 'login_link_timeout'), { status: 502, detail: entry.out.slice(-600) });
}

function ownedLogin(username, loginId) {
  const entry = logins.get(loginId);
  if (!entry || entry.username !== username) throw Object.assign(new Error('login_not_found'), { status: 404 });
  return entry;
}

export async function finishLogin(username, loginId, code) {
  const entry = ownedLogin(username, loginId);
  if (code) entry.child.stdin.write(`${String(code).trim()}\n`);
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline && !entry.done) await new Promise((r) => setTimeout(r, 400));
  return loginState(username, loginId);
}

export async function loginState(username, loginId) {
  const entry = ownedLogin(username, loginId);
  if (!entry.done) return { done: false };
  const status = await accountStatus(username, entry.deviceId, entry.app, { fresh: true });
  return { done: true, loggedIn: Boolean(status.loggedIn), status };
}
