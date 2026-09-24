#!/usr/bin/env node
// SYC Node — the small agent a customer runs on their own device.
//
// It signs in once with the customer's SYC-AI username and password, keeps a
// device token in ~/.syc-node/config.json (mode 0600), and then stays
// connected to the SYC-AI panel so the panel can run the customer's own
// professional AI accounts (Claude, Codex, …) HERE, on this machine. Tokens,
// files and the CLIs never leave the device; only the conversation does.
//
//   syc-node login  [--server https://syc-ai.com] [--name "My laptop"]
//   syc-node run                     keep the device connected (foreground)
//   syc-node status                  show the saved connection
//   syc-node logout                  forget the token on this device
//   syc-node update                  install a newer signed version now
//   syc-node pause | resume          stop / allow everything the panel asks of this device
//   syc-node log                     what the panel asked this device to do (last 40 lines)
//   syc-node uninstall               disconnect, stop the service and remove SYC Node
//   syc-node phone notify|link|text <value> [--title T]
//                                    hand something to the user's phone; it
//                                    waits there until the person taps it
//
// Requires Node.js 20+. No dependencies.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, platform as osPlatform } from 'node:process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync, renameSync, appendFileSync, statSync, rmSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join, dirname, delimiter, resolve as resolvePath, sep as pathSep } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promises as fsp } from 'node:fs';

export const VERSION = '0.7.0';
const DEFAULT_SERVER = 'https://syc-ai.com';
const HOME = join(process.env.SYC_NODE_HOME || homedir(), '.syc-node');
const CONFIG = join(HOME, 'config.json');
const HEARTBEAT_MS = 30_000;
// Updates: the agent checks this often, and only installs a file whose SHA-256
// is signed with SYC-AI's release key (the same key that signs panel releases).
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;
const RELEASE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAw1+zkSDSvJ/XGilXiFaN5zIETKqbguXySh4V5iyOHes=
-----END PUBLIC KEY-----`;
// Professional CLIs the panel installs for this user live in ~/.syc-node/npm
// (no root needed); ~/.local/bin is where the official Claude installer puts it.
// A service has a minimal PATH, so both are added here for every child.
{
  const sep = osPlatform === 'win32' ? ';' : ':';
  // ~/.syc-node/node is the private Node.js the installer adds when the system has none (npm lives there too).
  const extra = osPlatform === 'win32' ? [join(HOME, 'npm'), join(HOME, 'node')] : [join(HOME, 'npm', 'bin'), join(HOME, 'node', 'bin'), join(homedir(), '.local', 'bin')];
  process.env.PATH = [...extra, process.env.PATH || ''].join(sep);
}

// ---- what this device agrees to do -------------------------------------------
// The panel may only start the professional AI CLIs themselves, install them
// with npm into ~/.syc-node/npm, and run the official Cursor installer. File
// operations stay inside ~/.syc-node. Anything else is refused and logged.
// A power user can add commands in ~/.syc-node/policy.json: {"extraCommands": ["mytool"]}.
const AI_CLIS = new Set(['claude', 'codex', 'gemini', 'cursor-agent', 'kimi', 'qwen']);
const NPM_PACKAGES = new Set(['@anthropic-ai/claude-code', '@openai/codex', '@google/gemini-cli', '@moonshot-ai/kimi-code', '@qwen-code/qwen-code']);
const CURSOR_INSTALL = 'curl -fsSL https://cursor.com/install | bash';
// Environment the panel may set for a child. Nothing that changes where a CLI
// sends its credentials (base URLs) or what code Node/the shell preloads.
const ENV_ALLOWED = new Set(['TERM', 'ENABLE_TOOL_SEARCH', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'NO_COLOR', 'FORCE_COLOR']);

function localPolicy() {
  try { return JSON.parse(readFileSync(join(HOME, 'policy.json'), 'utf8')) || {}; } catch { return {}; }
}

export function commandAllowed(bin, args = []) {
  const name = String(bin || '');
  if (!name || /[\\/]/.test(name)) return false; // names only, never a path
  if (AI_CLIS.has(name)) return true;
  if (name === 'npm') {
    if (args.length === 1 && args[0] === '--version') return true;
    return args.length === 5 && args[0] === 'install' && args[1] === '-g' && args[2] === '--prefix'
      && args[3] === '~/.syc-node/npm' && NPM_PACKAGES.has(String(args[4]).replace(/@latest$/, '')) && /@latest$/.test(String(args[4]));
  }
  if (name === 'bash') return args.length === 2 && args[0] === '-lc' && args[1] === CURSOR_INSTALL;
  const extra = localPolicy().extraCommands;
  return Array.isArray(extra) && extra.includes(name);
}

export function safeEnv(env) {
  const out = {};
  for (const [key, value] of Object.entries(env || {})) if (ENV_ALLOWED.has(key)) out[key] = String(value);
  return out;
}

// A path the panel names must resolve inside ~/.syc-node (after ~ expansion).
export function insideHome(path, home = HOME) {
  if (typeof path !== 'string' || !path) return null;
  const full = resolvePath(path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
  const root = resolvePath(home);
  return full === root || full.startsWith(root + pathSep) ? full : null;
}

const PAUSED = join(HOME, 'paused');
const isPaused = () => existsSync(PAUSED);
const ACTIVITY = join(HOME, 'activity.log');
function activity(line) {
  try {
    mkdirSync(HOME, { recursive: true, mode: 0o700 });
    try { if (statSync(ACTIVITY).size > 2_000_000) renameSync(ACTIVITY, `${ACTIVITY}.1`); } catch { /* first line */ }
    appendFileSync(ACTIVITY, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 });
  } catch { /* logging never stops the agent */ }
}

// ---- messages in the language the installer chose ------------------------------
const MESSAGES = {
  en: { user: 'SYC-AI username: ', pass: 'SYC-AI password: ', name: 'Device name', connected: 'Connected as device', notConnected: 'Not connected. Run: syc-node login', paused: 'Paused: the panel cannot use this device until you run "syc-node resume".', resumed: 'Resumed: the panel can use this device again.', removed: 'SYC Node was removed from this device.' },
  fa: { user: 'نام کاربری SYC-AI: ', pass: 'رمز SYC-AI: ', name: 'نام دستگاه', connected: 'وصل شد؛ نام دستگاه', notConnected: 'وصل نیست. اجرا کنید: syc-node login', paused: 'متوقف شد: تا «syc-node resume» را نزنید، پنل از این دستگاه استفاده نمی‌کند.', resumed: 'دوباره فعال شد: پنل می‌تواند از این دستگاه استفاده کند.', removed: 'SYC Node از این دستگاه حذف شد.' },
  ar: { user: 'اسم مستخدم SYC-AI: ', pass: 'كلمة مرور SYC-AI: ', name: 'اسم الجهاز', connected: 'تم الاتصال باسم الجهاز', notConnected: 'غير متصل. شغّل: syc-node login', paused: 'تم الإيقاف المؤقت: لن تستخدم اللوحة هذا الجهاز حتى تشغّل "syc-node resume".', resumed: 'تم الاستئناف: يمكن للوحة استخدام هذا الجهاز مجددًا.', removed: 'تمت إزالة SYC Node من هذا الجهاز.' },
  ru: { user: 'Имя пользователя SYC-AI: ', pass: 'Пароль SYC-AI: ', name: 'Имя устройства', connected: 'Подключено как устройство', notConnected: 'Не подключено. Выполните: syc-node login', paused: 'Пауза: панель не использует это устройство, пока вы не выполните "syc-node resume".', resumed: 'Возобновлено: панель снова может использовать это устройство.', removed: 'SYC Node удалён с этого устройства.' },
  zh: { user: 'SYC-AI 用户名：', pass: 'SYC-AI 密码：', name: '设备名称', connected: '已连接，设备名', notConnected: '未连接。请运行：syc-node login', paused: '已暂停：在你运行 "syc-node resume" 之前，面板不会使用此设备。', resumed: '已恢复：面板可以再次使用此设备。', removed: '已从此设备移除 SYC Node。' },
  es: { user: 'Usuario de SYC-AI: ', pass: 'Contraseña de SYC-AI: ', name: 'Nombre del dispositivo', connected: 'Conectado como dispositivo', notConnected: 'Sin conexión. Ejecuta: syc-node login', paused: 'En pausa: el panel no usará este dispositivo hasta que ejecutes "syc-node resume".', resumed: 'Reanudado: el panel puede volver a usar este dispositivo.', removed: 'SYC Node se eliminó de este dispositivo.' },
};
function lang() {
  const wanted = String(flag('lang', process.env.SYC_LANG || loadConfig()?.lang || 'en')).slice(0, 2).toLowerCase();
  return MESSAGES[wanted] ? wanted : 'en';
}
const say = (key) => MESSAGES[lang()][key] || MESSAGES.en[key];

const platform = () => ({ linux: 'linux', win32: 'windows', darwin: 'macos', android: 'android' })[osPlatform] || 'linux';
const flag = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };

function loadConfig() {
  if (!existsSync(CONFIG)) return null;
  try { return JSON.parse(readFileSync(CONFIG, 'utf8')); } catch { return null; }
}
function saveConfig(config) {
  mkdirSync(HOME, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(CONFIG, 0o600); } catch {}
}

async function api(server, path, { token, body } = {}) {
  const response = await fetch(new URL(path, server), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'user-agent': `syc-node/${VERSION}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.error || `http_${response.status}`), { status: response.status });
  return value.data;
}

// What professional CLIs exist on this device — the panel shows the customer
// which accounts it can run here. Detection only; nothing is started.
export function detectTools() {
  const tools = {};
  for (const [id, command] of [['claude', 'claude'], ['codex', 'codex'], ['gemini', 'gemini'], ['cursor', 'cursor-agent'], ['kimi', 'kimi']]) {
    try {
      const out = execFileSync(command, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000, shell: osPlatform === 'win32' }).toString().trim().split('\n')[0];
      tools[id] = out.slice(0, 60);
    } catch { /* not installed */ }
  }
  return tools;
}

async function login() {
  const server = flag('server', loadConfig()?.server || DEFAULT_SERVER);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(`SYC Node ${VERSION} — connect this ${platform()} device to ${server}\n`);
    // Non-interactive installs (automation, tests) may pass the credentials in the environment.
    const username = process.env.SYC_NODE_USER || await rl.question(say('user'));
    const password = process.env.SYC_NODE_PASSWORD || await rl.question(say('pass'));
    const name = flag('name', process.env.SYC_NODE_NAME || (process.env.SYC_NODE_USER ? hostname() : (await rl.question(`${say('name')} [${hostname()}]: `) || hostname())));
    const enrolled = await api(server, '/api/node/login', { body: { username, password, name, platform: platform(), agentVersion: VERSION } });
    saveConfig({ server, deviceId: enrolled.deviceId, token: enrolled.token, name, lang: lang(), createdAt: new Date().toISOString() });
    activity(`signed in as device "${name}" (${enrolled.deviceId})`);
    stdout.write(`${say('connected')} "${name}" (${enrolled.deviceId}).\n`);
  } finally { rl.close(); }
}

// ---- live channel ------------------------------------------------------------
// The panel talks to this device through the SYC-AI hub: a long-lived SSE
// downlink carries commands (spawn a CLI, feed stdin, kill, small file ops);
// every result goes back with a POST. Nothing here opens a port.
const children = new Map(); // procId → ChildProcess

async function emit(config, event) {
  try { await api(config.server, '/api/node/emit', { token: config.token, body: event }); }
  catch (error) { if (error.status === 401) { console.error('This device was disconnected from the panel. Run: syc-node login'); process.exit(3); } }
}

// Windows: `cmd` mangles multi-line and quoted arguments, so an npm shim
// (claude.cmd, codex.cmd) is resolved to the real .exe or .js it launches and
// that is spawned directly, without a shell.
function windowsTarget(bin, args) {
  if (osPlatform !== 'win32' || /[\\/]/.test(bin)) return null;
  for (const dir of String(process.env.PATH || '').split(delimiter).filter(Boolean)) {
    const exe = join(dir, `${bin}.exe`);
    if (existsSync(exe)) return { file: exe, args };
    const cmd = join(dir, `${bin}.cmd`);
    if (!existsSync(cmd)) continue;
    try {
      const target = /"%(?:~?dp0)%\\?([^"]+)"/i.exec(readFileSync(cmd, 'utf8').split(/\r?\n/).filter((l) => l.includes('%dp0%')).pop() || '')?.[1];
      if (target) {
        const full = join(dir, target);
        if (/\.exe$/i.test(full)) return { file: full, args };
        if (/\.[cm]?js$/i.test(full)) return { file: process.execPath, args: [full, ...args] };
      }
    } catch { /* fall back to the shell */ }
    return null;
  }
  return null;
}

function handleSpawn(config, command) {
  const { procId, bin, args = [], timeoutMs } = command;
  if (isPaused()) { activity(`refused (paused): ${bin}`); emit(config, { type: 'error', procId, message: 'device_paused' }); return; }
  if (!commandAllowed(bin, args)) {
    activity(`REFUSED command not on the list: ${String(bin).slice(0, 60)} ${JSON.stringify(args).slice(0, 200)}`);
    emit(config, { type: 'error', procId, message: 'command_not_allowed' });
    return;
  }
  const env = safeEnv(command.env);
  activity(`run ${bin} ${args.map((a) => String(a).slice(0, 60)).join(' ').slice(0, 300)}${command.cwd ? ` (in ${String(command.cwd).slice(0, 120)})` : ''}`);
  // No cwd → a private workspace under ~/.syc-node so the CLI never scans the whole home.
  const cwd = expand(command.cwd) || join(HOME, 'workspace');
  let child;
  try {
    mkdirSync(cwd, { recursive: true });
    const expanded = args.map(expand);
    const direct = windowsTarget(bin, expanded);
    child = direct
      ? spawn(direct.file, direct.args, { cwd, env: { ...process.env, ...(env || {}) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      : spawn(bin, expanded, { cwd, env: { ...process.env, ...(env || {}) }, stdio: ['pipe', 'pipe', 'pipe'], shell: osPlatform === 'win32' && !/[\\/]/.test(bin), windowsHide: true });
  } catch (error) { emit(config, { type: 'error', procId, message: error.message }); return; }
  children.set(procId, child);
  emit(config, { type: 'spawned', procId, pid: child.pid });
  // Coalesce output into ~50 ms batches so a chatty CLI does not become thousands of POSTs.
  const queue = { stdout: '', stderr: '' }; let flushTimer = null;
  const flush = () => {
    flushTimer = null;
    for (const stream of ['stdout', 'stderr']) if (queue[stream]) { const data = queue[stream]; queue[stream] = ''; emit(config, { type: stream, procId, data }); }
  };
  const push = (stream, chunk) => { queue[stream] += chunk.toString('utf8'); if (queue[stream].length > 65536) flush(); else if (!flushTimer) flushTimer = setTimeout(flush, 50); };
  child.stdout.on('data', (c) => push('stdout', c));
  child.stderr.on('data', (c) => push('stderr', c));
  child.on('error', (error) => { emit(config, { type: 'error', procId, message: error.message }); children.delete(procId); });
  child.on('close', (code, signal) => { flush(); children.delete(procId); emit(config, { type: 'exit', procId, code, signal }); });
  if (timeoutMs) setTimeout(() => { if (children.has(procId)) child.kill('SIGKILL'); }, timeoutMs).unref();
}

const expand = (p) => (typeof p === 'string' && (p === '~' || p.startsWith('~/')) ? join(homedir(), p.slice(2)) : p);

async function handleFs(command) {
  const { op, data, encoding = 'utf8', limit = 1_048_576 } = command;
  if (isPaused()) return { error: 'device_paused' };
  const path = insideHome(command.path);
  if (!path) {
    activity(`REFUSED file ${op} outside ~/.syc-node: ${String(command.path).slice(0, 160)}`);
    return { error: 'path_not_allowed' };
  }
  if (['write', 'rm'].includes(op)) activity(`${op} ${path}`);
  try {
    if (op === 'read') { const buf = await fsp.readFile(path); return { result: buf.length > limit ? { truncated: true, data: buf.subarray(0, limit).toString(encoding) } : { data: buf.toString(encoding) } }; }
    if (op === 'write') { await fsp.mkdir(join(path, '..'), { recursive: true }); await fsp.writeFile(path, Buffer.from(String(data ?? ''), encoding)); return { result: { ok: true } }; }
    if (op === 'list') { const entries = await fsp.readdir(path, { withFileTypes: true }); return { result: entries.slice(0, 2000).map((e) => ({ name: e.name, dir: e.isDirectory() })) }; }
    if (op === 'stat') { const st = await fsp.stat(path); return { result: { size: st.size, dir: st.isDirectory(), mtime: st.mtimeMs } }; }
    if (op === 'append') { await fsp.mkdir(join(path, '..'), { recursive: true }); await fsp.appendFile(path, Buffer.from(String(data ?? ''), encoding)); return { result: { ok: true } }; }
    if (op === 'exists') { try { await fsp.access(path); return { result: { exists: true } }; } catch { return { result: { exists: false } }; } }
    if (op === 'mkdir') { await fsp.mkdir(path, { recursive: true }); return { result: { ok: true } }; }
    if (op === 'rm') { await fsp.rm(path, { recursive: Boolean(command.recursive), force: true }); return { result: { ok: true } }; }
    return { error: 'unsupported_op' };
  } catch (error) { return { error: error.code || error.message }; }
}

async function handleCommand(config, command) {
  switch (command.type) {
    case 'spawn': handleSpawn(config, command); break;
    case 'stdin': { const child = children.get(command.procId); if (!child) break; if (command.end) child.stdin.end(); else child.stdin.write(command.data ?? ''); break; }
    case 'kill': { const child = children.get(command.procId); if (child) child.kill(command.signal || 'SIGTERM'); break; }
    case 'fs': { const reply = await handleFs(command); await emit(config, { type: 'fs', requestId: command.requestId, ...reply }); break; }
    case 'ping': break;
    default: if (command.requestId) await emit(config, { type: 'unsupported', requestId: command.requestId, error: 'unsupported_command' });
  }
}

async function listen(config, tools) {
  const response = await fetch(new URL('/api/node/stream', config.server), {
    headers: { authorization: `Bearer ${config.token}`, 'user-agent': `syc-node/${VERSION}`, accept: 'text/event-stream' },
  });
  if (response.status === 401) { console.error('This device was disconnected from the panel. Run: syc-node login'); process.exit(3); }
  if (!response.ok || !response.body) throw new Error(`stream_http_${response.status}`);
  console.log(`connected to ${config.server}`);
  const beat = () => emit(config, { type: 'heartbeat', agentVersion: VERSION, tools, home: homedir(), platform: platform(), panelDir: join(HOME, 'panel'), paused: isPaused() });
  await beat();
  const heartbeat = setInterval(beat, HEARTBEAT_MS);
  try {
    const decoder = new TextDecoder(); let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        let event = 'message'; let data = '';
        for (const line of block.split('\n')) { if (line.startsWith('event: ')) event = line.slice(7); else if (line.startsWith('data: ')) data += line.slice(6); }
        if (event === 'command' && data) { try { handleCommand(config, JSON.parse(data)); } catch (error) { console.error('bad command', error.message); } }
      }
    }
  } finally { clearInterval(heartbeat); }
  throw new Error('stream_closed');
}

const newer = (a, b) => {
  const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

// Central update: fetch the signed manifest, and if it names a newer version,
// download it, check hash + signature, swap the file in place and restart.
export async function updateIfNewer(config, { restart = true } = {}) {
  const base = config?.server || DEFAULT_SERVER;
  const response = await fetch(new URL('/node/version.json', base), { headers: { 'user-agent': `syc-node/${VERSION}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`update manifest http_${response.status}`);
  const manifest = await response.json();
  if (!newer(manifest.version, VERSION)) return { updated: false, version: VERSION };
  const signed = Buffer.from(`syc-node\n${manifest.version}\n${manifest.sha256}\n`);
  if (!verifySignature(null, signed, createPublicKey(RELEASE_PUBLIC_KEY), Buffer.from(String(manifest.signature || ''), 'base64'))) {
    throw new Error('update signature is not valid; not installing');
  }
  const file = await fetch(new URL('/node/syc-node.mjs', base), { headers: { 'user-agent': `syc-node/${VERSION}` }, signal: AbortSignal.timeout(60_000) });
  if (!file.ok) throw new Error(`update download http_${file.status}`);
  const body = Buffer.from(await file.arrayBuffer());
  if (createHash('sha256').update(body).digest('hex') !== manifest.sha256) throw new Error('update file does not match the signed hash; not installing');
  const self = fileURLToPath(import.meta.url);
  const staged = `${self}.new`;
  writeFileSync(staged, body, { mode: 0o644 });
  renameSync(staged, self);
  console.log(`updated SYC Node ${VERSION} → ${manifest.version}`);
  if (restart) {
    // A systemd service restarts on its own (Restart=always); anything else
    // (Windows task, background process) starts the new version itself.
    if (!process.env.INVOCATION_ID) spawn(process.execPath, [self, 'run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    process.exit(0);
  }
  return { updated: true, version: manifest.version };
}

async function run() {
  const config = loadConfig();
  if (!config?.token) { console.error('Not connected. Run: syc-node login'); process.exit(2); }
  const tools = detectTools();
  console.log(`SYC Node ${VERSION} · device ${config.name} · ${config.server} · tools: ${Object.keys(tools).join(', ') || 'none found'}`);
  const checkUpdate = () => updateIfNewer(config).catch((error) => console.error(`update check: ${error.message}`));
  await checkUpdate();
  setInterval(checkUpdate, UPDATE_EVERY_MS).unref();
  let delay = 2000;
  for (;;) {
    const started = Date.now();
    try { await listen(config, tools); } catch (error) { console.error(`link lost (${error.message}); reconnecting`); }
    for (const child of children.values()) { try { child.kill('SIGTERM'); } catch { /* gone */ } }
    children.clear();
    delay = Date.now() - started > 60_000 ? 2000 : Math.min(delay * 2, 60_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function status() {
  const config = loadConfig();
  if (!config?.token) { console.log('Not connected.'); return; }
  try {
    const { device } = await api(config.server, '/api/node/session', { token: config.token });
    console.log(`Connected: ${device.name} (${device.platform}) · ${config.server} · id ${device.deviceId}`);
  } catch (error) { console.log(`Saved connection to ${config.server} is not valid any more (${error.message}). Run: syc-node login`); }
}

const PHONE_ERRORS = {
  no_phone_connected: 'No phone is connected to this account (SYC Claw → sign in).',
  phone_queue_full: 'The phone already has 20 requests waiting; wait until some are opened.',
  invalid_url: 'A link must start with https:// or http://.',
  empty_request: 'Nothing to send.',
  phone_permission_off: 'The user has not allowed this on their phone. They can allow it in the SYC-AI panel: Connection → Android.',
};
async function phone() {
  const [kind, value] = [process.argv[3], process.argv[4]];
  const config = kind && value ? loadConfig() : null;
  if (kind && value && !config?.token) { console.error('Not connected. Run: syc-node login'); process.exit(2); }
  if (kind === 'allowed') {
    const cfg = loadConfig();
    if (!cfg?.token) { console.error('Not connected. Run: syc-node login'); process.exit(2); }
    const { permissions } = await api(cfg.server, '/api/node/phone', { token: cfg.token });
    console.log(Object.entries(permissions).map(([k, on]) => `${k}: ${on ? 'allowed' : 'off'}`).join('\n'));
    return;
  }
  if (kind === 'status' && value) {
    const data = await api(config.server, `/api/node/phone/${encodeURIComponent(value)}`, { token: config.token });
    console.log(`${data.status} (${data.kind}, sent ${data.createdAt}${data.actedAt ? `, acted ${data.actedAt}` : ''})`);
    return;
  }
  if (!['notify', 'link', 'text'].includes(kind) || !value) {
    console.log([
      'usage: syc-node phone notify "message" [--title T]   show a notification on the phone',
      '       syc-node phone link <https://…> [--title T]   the person taps it to open the link',
      '       syc-node phone text "text" [--title T]        the person taps it to copy or share the text',
      '       syc-node phone status <requestId>',
      '       syc-node phone allowed                        what the user lets agents send (set in the panel)',
    ].join('\n'));
    process.exit(kind ? 2 : 0);
  }
  const title = flag('title', '');
  const body = kind === 'link' ? { kind, url: value, title } : { kind, body: value, title };
  try {
    const data = await api(config.server, '/api/node/phone', { token: config.token, body });
    console.log(`Sent to the phone: ${data.requestId}. It waits there until the person taps it (check: syc-node phone status ${data.requestId}).`);
  } catch (error) {
    console.error(PHONE_ERRORS[error.message] || error.message);
    process.exit(1);
  }
}

async function update() {
  const result = await updateIfNewer(loadConfig(), { restart: false });
  console.log(result.updated ? `Updated to ${result.version}. The running agent picks it up at its next check or restart.` : `SYC Node ${VERSION} is up to date.`);
}

async function logout() {
  const config = loadConfig();
  // Tell the panel first, so the token is dead there too (older panels: ignored).
  if (config?.token) await api(config.server, '/api/node/logout', { token: config.token, body: {} }).catch(() => {});
  if (existsSync(CONFIG)) unlinkSync(CONFIG);
  activity('signed out on this device');
  console.log('Disconnected on this device.');
}

async function pause() { mkdirSync(HOME, { recursive: true, mode: 0o700 }); writeFileSync(PAUSED, new Date().toISOString()); activity('paused by the owner of this device'); console.log(say('paused')); }
async function resume() { if (existsSync(PAUSED)) unlinkSync(PAUSED); activity('resumed by the owner of this device'); console.log(say('resumed')); }
async function log() {
  if (!existsSync(ACTIVITY)) { console.log('Nothing yet.'); return; }
  console.log(readFileSync(ACTIVITY, 'utf8').trim().split('\n').slice(-40).join('\n'));
}

// Everything the installers created, undone: service / task / cron entry,
// the `syc-node` launcher, and ~/.syc-node (with the CLIs installed into it).
// Your own AI logins (~/.claude, ~/.codex) are yours and are left alone.
async function uninstall() {
  await logout().catch(() => {});
  const quiet = { stdio: 'ignore' };
  const tryRun = (file, args) => { try { execFileSync(file, args, quiet); } catch { /* not present */ } };
  if (osPlatform === 'win32') {
    tryRun('powershell', ['-NoProfile', '-Command', "Unregister-ScheduledTask -TaskName 'SYC Node' -Confirm:$false -ErrorAction SilentlyContinue"]);
    try { rmSync(join(process.env.LOCALAPPDATA || homedir(), 'SYC-AI'), { recursive: true, force: true }); } catch { /* gone */ }
  } else {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      tryRun('systemctl', ['disable', '--now', 'syc-node.service']);
      try { rmSync('/etc/systemd/system/syc-node.service', { force: true }); } catch { /* gone */ }
      tryRun('systemctl', ['daemon-reload']);
    }
    tryRun('systemctl', ['--user', 'disable', '--now', 'syc-node.service']);
    try { rmSync(join(homedir(), '.config', 'systemd', 'user', 'syc-node.service'), { force: true }); } catch { /* gone */ }
    try {
      const current = execFileSync('crontab', ['-l'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const kept = current.split('\n').filter((line) => !line.includes('syc-node.mjs run')).join('\n');
      if (kept !== current) execFileSync('crontab', ['-'], { input: kept.endsWith('\n') ? kept : `${kept}\n` });
    } catch { /* no crontab */ }
    try { rmSync(join(homedir(), '.local', 'bin', 'syc-node'), { force: true }); } catch { /* gone */ }
  }
  rmSync(HOME, { recursive: true, force: true });
  console.log(say('removed'));
  process.exit(0);
}

const command = process.argv[2];
const commands = { login, run, status, logout, phone, update, pause, resume, log, uninstall };
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('syc-node.mjs') || process.argv[1]?.endsWith('syc-node')) {
  if (!commands[command]) {
    console.log('usage: syc-node <login|run|status|logout|phone|update|pause|resume|log|uninstall> [--server URL] [--name NAME] [--lang en|fa|ar|ru|zh|es]');
    process.exit(command ? 2 : 0);
  }
  commands[command]().catch((error) => { console.error(error.message); process.exit(1); });
}
