// Hosted panel: install and sign in professional accounts on the customer's own
// device through the SYC-AI hub. Nothing here runs on our server; every command
// is spawned by the customer's SYC Node agent under the customer's own login.
import { deviceFs, hubDevices, spawnOnDevice } from './remote-runner.mjs';

// How each account signs in on the device (official methods only):
//   claude  `claude auth login --claudeai` — link, then paste the code back.
//   codex   `codex login --device-auth` — link + code, the CLI waits.
//   cursor  `cursor-agent login` — link, the CLI waits for the browser
//           (https://cursor.com/docs/cli/reference/authentication).
//   kimi    `kimi login --region global|mainland-cn` — RFC 8628 device code;
//           sign-out is the ACP `logout` method (the CLI has no logout command)
//           (https://moonshotai.github.io/kimi-code/).
//   gemini  a Gemini API key: Google replaced Gemini CLI with Antigravity for
//           unpaid and Google One accounts on 2026-06-18, and its Google sign-in
//           needs an interactive terminal. The key is written to
//           ~/.syc-node/.env on the device, the .env file Gemini CLI finds from
//           every folder SYC-AI runs it in (https://geminicli.com/docs/get-started/authentication/).
//           It passes through the panel once, in memory, and is never stored,
//           logged or read back here.
// `panel`: a chat panel for this account exists on the hosted server.
export const DEVICE_ACCOUNTS = Object.freeze({
  claude: {
    name: 'Claude', bin: 'claude', pkg: '@anthropic-ai/claude-code', panel: true,
    status: ['auth', 'status'],
    loggedIn: (out, code) => code === 0 && /"loggedIn"\s*:\s*true/.test(out),
    login: ['auth', 'login', '--claudeai'],
    urlRe: /(https:\/\/claude\.(?:com|ai)\/[^\s"']*oauth\/authorize\?[^\s"']+)/,
    needsCode: true,
    // Who is signed in, shown on the card: the email and plan only.
    account: (out) => { try { const j = JSON.parse(out.slice(out.indexOf('{'))); return { email: String(j.email || '').slice(0, 120), plan: String(j.subscriptionType || '').slice(0, 30) }; } catch { return null; } },
  },
  codex: {
    name: 'Codex', bin: 'codex', pkg: '@openai/codex', panel: true,
    status: ['login', 'status'],
    loggedIn: (out, code) => code === 0 && /logged in/i.test(out) && !/not logged in/i.test(out),
    login: ['login', '--device-auth'],
    urlRe: /(https:\/\/auth\.openai\.com\/[^\s"'\u001b]+)/,
    codeRe: /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/,
    needsCode: false,
    // The second official way: an OpenAI API key, piped to `codex login --with-api-key`.
    keyLogin: { args: ['login', '--with-api-key'], getUrl: 'https://platform.openai.com/api-keys' },
    account: (out) => ({ method: /api key/i.test(out) ? 'api-key' : 'chatgpt' }),
  },
  gemini: {
    name: 'Gemini', bin: 'gemini', pkg: '@google/gemini-cli',
    apiKey: { file: '~/.syc-node/.env', variable: 'GEMINI_API_KEY', getUrl: 'https://aistudio.google.com/apikey' },
  },
  cursor: {
    name: 'Cursor', bin: 'cursor-agent',
    installer: (platform) => (platform === 'windows' ? null : { bin: 'bash', args: ['-lc', 'curl -fsSL https://cursor.com/install | bash'] }),
    status: ['status', '--format', 'json'],
    loggedIn: (out, code) => code === 0 && /"isAuthenticated"\s*:\s*true/.test(out),
    login: ['login'],
    urlRe: /(https:\/\/cursor\.com\/loginDeepControl\?[^\s"'\u001b]+)/,
    needsCode: false,
    logout: ['logout'],
  },
  kimi: {
    name: 'Kimi', bin: 'kimi', pkg: '@moonshot-ai/kimi-code',
    status: ['provider', 'list'],
    loggedIn: (out, code) => code === 0 && /^managed:kimi-code\s.*source=oauth/m.test(out),
    login: ['login', '--region', 'global'],
    regions: { global: ['login', '--region', 'global'], 'mainland-cn': ['login', '--region', 'mainland-cn'] },
    urlRe: /(https:\/\/(?:www\.)?kimi\.(?:ai|com)\/code\/authorize_device\?[^\s"'\u001b]+)/,
    codeRe: /enter code:\s*([A-Z0-9]{4}-[A-Z0-9]{4,8})/i,
    needsCode: false,
    acpLogout: true,
  },
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
  } else if (spec.apiKey) {
    // Only whether the key file exists — its content never leaves the device.
    const saved = await deviceFs.exists(deviceId, spec.apiKey.file);
    value = { app, installed: true, version: version.out.trim().split('\n')[0].slice(0, 60), loggedIn: saved, ...(saved ? { method: 'api-key' } : {}) };
  } else {
    const status = await runOnDevice(deviceId, spec.bin, spec.status, { timeoutMs: 30_000, env: accountEnv(app) });
    const loggedIn = spec.loggedIn(status.out, status.code);
    const who = loggedIn && spec.account ? spec.account(status.out) : null;
    value = { app, installed: true, version: version.out.trim().split('\n')[0].slice(0, 60), loggedIn, ...(who ? { account: who } : {}) };
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

export async function startLogin(username, deviceId, app, { region } = {}) {
  const device = await ownedDevice(username, deviceId);
  const spec = account(app);
  if (SECOND_ACCOUNTS[app] && !secondAccountReady(device)) throw Object.assign(new Error('update_syc_node'), { status: 409 });
  if (spec.installOnly) throw Object.assign(new Error('sign_in_not_available_yet'), { status: 409 });
  if (!spec.login) throw Object.assign(new Error(spec.apiKey ? 'api_key_sign_in' : 'sign_in_not_available_yet'), { status: 409 });
  let args = spec.login;
  if (region) {
    if (!spec.regions || !Object.hasOwn(spec.regions, region)) throw Object.assign(new Error('unknown_region'), { status: 400 });
    args = spec.regions[region];
  }
  statusCache.delete(`${deviceId}/${app}`);
  const child = spawnOnDevice(deviceId, { bin: spec.bin, args, timeoutMs: 15 * 60_000, env: accountEnv(app) });
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

// A pasted API key (Gemini). One line, no spaces or quotes, so it can only
// ever be the value of that one variable in the .env file.
const API_KEY_RE = /^[A-Za-z0-9._-]{20,200}$/;

// A pasted key is checked with its provider before it goes to the device
// (a free model-list call; the key is never stored or logged here). The CLIs
// themselves accept any string, so a typo would otherwise show as signed in.
const KEY_CHECK = {
  codex: (key) => fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }),
  gemini: (key) => fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) }),
};
async function checkKey(app, key) {
  const check = KEY_CHECK[SECOND_ACCOUNTS[app] || app];
  if (!check) return;
  let response;
  try { response = await check(key); } catch { return; } // provider unreachable: do not block the user
  // A wrong key gets the provider's JSON error; an HTML 403 is Google refusing
  // this server's address (region block), which says nothing about the key.
  // OpenAI's JSON 403 "unsupported_country_region_territory" is the same case.
  const json = /json/i.test(response.headers?.get?.('content-type') || '');
  const body = await response.text().catch(() => '');
  if (/unsupported_country/.test(body)) return;
  if (json && [400, 401, 403].includes(response.status)) throw Object.assign(new Error('api_key_rejected'), { status: 400 });
}

export async function saveApiKey(username, deviceId, app, key) {
  await ownedDevice(username, deviceId);
  const spec = account(app);
  if (!(spec.apiKey || spec.keyLogin) || (spec.apiKey && SECOND_ACCOUNTS[app])) throw Object.assign(new Error('api_key_not_supported'), { status: 409 });
  const value = String(key ?? '').trim();
  if (!API_KEY_RE.test(value)) throw Object.assign(new Error('invalid_api_key'), { status: 400 });
  await checkKey(app, value);
  statusCache.delete(`${deviceId}/${app}`);
  if (spec.keyLogin) {
    // The CLI's own sign-in: the key goes to its stdin, never on a command line.
    const child = spawnOnDevice(deviceId, { bin: spec.bin, args: spec.keyLogin.args, timeoutMs: 60_000, env: accountEnv(app) });
    let out = '';
    child.stdout.on('data', (c) => { out += c; }); child.stderr.on('data', (c) => { out += c; });
    child.on('error', () => {});
    const code = await new Promise((resolve) => { child.on('close', resolve); child.stdin.write(`${value}\n`); child.stdin.end(); });
    if (code !== 0) throw Object.assign(new Error('api_key_rejected'), { status: 400, detail: strip(out).replace(value, '…').slice(-300) });
    return accountStatus(username, deviceId, app, { fresh: true });
  }
  await deviceFs.write(deviceId, spec.apiKey.file, `# Saved by SYC-AI for ${spec.name} on this device. Delete this file to sign out.\n${spec.apiKey.variable}=${value}\n`);
  return accountStatus(username, deviceId, app, { fresh: true });
}

// Sign out on the device with the CLI's own command (or remove the saved key).
export async function signOut(username, deviceId, app) {
  await ownedDevice(username, deviceId);
  const spec = account(app);
  if (SECOND_ACCOUNTS[app]) throw Object.assign(new Error('sign_out_not_available'), { status: 409 });
  statusCache.delete(`${deviceId}/${app}`);
  if (spec.apiKey) await deviceFs.rm(deviceId, spec.apiKey.file);
  else if (spec.logout) {
    const done = await runOnDevice(deviceId, spec.bin, spec.logout, { timeoutMs: 60_000 });
    if (done.code !== 0) throw Object.assign(new Error(done.error || 'sign_out_failed'), { status: 502, detail: done.out.slice(-400) });
  } else if (spec.acpLogout) await acpLogout(deviceId, spec.bin);
  else throw Object.assign(new Error('sign_out_not_available'), { status: 409 });
  return accountStatus(username, deviceId, app, { fresh: true });
}

// Agent Client Protocol: initialize, then `logout` (the CLI drops its token and
// the managed provider), then close stdin so the CLI exits.
function acpLogout(deviceId, bin) {
  return new Promise((resolve, reject) => {
    const child = spawnOnDevice(deviceId, { bin, args: ['acp'], timeoutMs: 60_000 });
    let out = ''; let settled = false;
    const finish = (error) => { if (settled) return; settled = true; clearTimeout(timer); try { child.stdin.end(); } catch {} if (error) reject(error); else resolve(); };
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish(Object.assign(new Error('sign_out_timeout'), { status: 504 })); }, 45_000);
    child.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
      for (const line of out.split('\n')) {
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2) finish(msg.error ? Object.assign(new Error('sign_out_failed'), { status: 502 }) : null);
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => {});
    child.on('close', () => finish(Object.assign(new Error(child.spawnError || 'sign_out_failed'), { status: 502 })));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'logout', params: {} })}\n`);
  });
}
