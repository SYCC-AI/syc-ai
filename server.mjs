// SYC-AI — the standalone panel server.
//
// Self-contained by design: no imports, data or configuration from anywhere
// else. One account (admin) for now; its scrypt hash lives in data/users.json
// (create or reset it with scripts/set-admin-password.mjs).
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeviceLink, CAPABILITIES } from './device-link.mjs';
import { createTenantApps } from './tenant-apps.mjs';
import * as deviceAccounts from './device-accounts.mjs';
import { countIdea, deviceFs, phoneAlertFor, spawnOnDevice } from './remote-runner.mjs';
import { createAllInOne, suggestPriority } from './all-in-one.mjs';
import { IDEAS } from './all-in-one-catalog.mjs';
import { createInstallerRuntime } from './installer-runtime.mjs';
import { createControlPlaneClient } from './control-plane-client.mjs';
import { createInstallationActivation } from './installation-activation.mjs';
import { createOnboardingServer } from './onboarding-server.mjs';
import { centralRouteDecision } from './central-access-policy.mjs';
import { startLegacyEdgeClient } from './server-startup.mjs';
import { createUpdateService } from './update-service.mjs';
import { createAssetDownloader, createHealthCheck, extractArchive } from './update-runtime.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = resolve(ROOT, 'public');
const DATA_DIR = resolve(ROOT, 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');
const SECRET_FILE = join(DATA_DIR, 'session-secret');
const PORT = Number(process.env.SYC_AI_PORT || process.env.FREE_WEB_PORT || 8782);
const SESSION_TTL = 12 * 60 * 60 * 1000;
const COOKIE = 'sycfree';
const CONTROL_URL = String(process.env.SYC_AI_CONTROL_URL || '');
const PUBLIC_ORIGIN = String(process.env.SYC_AI_PUBLIC_ORIGIN || '');
const ENTITLEMENT_PUBLIC_KEY_FILE = String(process.env.SYC_AI_ENTITLEMENT_PUBLIC_KEY_FILE || '');
const RELEASE_PUBLIC_KEY_FILE = String(process.env.SYC_AI_RELEASE_PUBLIC_KEY_FILE || '');
const UPDATE_STATE_FILE = join(DATA_DIR, 'release-state.json');
const activation = CONTROL_URL && PUBLIC_ORIGIN && ENTITLEMENT_PUBLIC_KEY_FILE
  ? createInstallationActivation({
      dataDirectory: DATA_DIR,
      controlClient: createControlPlaneClient({ baseUrl: CONTROL_URL }),
      entitlementPublicKey: readFileSync(ENTITLEMENT_PUBLIC_KEY_FILE, 'utf8'),
      version: process.env.SYC_AI_VERSION || '0.1.0-preview.1',
    })
  : null;
const onboarding = activation
  ? createOnboardingServer({
      controlClient: createControlPlaneClient({ baseUrl: CONTROL_URL }),
      activation,
      productOrigin: PUBLIC_ORIGIN,
      hosted: process.env.SYC_AI_HOSTED === '1',
    })
  : null;

// The repair path. Without a pinned release key there is no trustworthy way to
// be told what to install, so the channel stays off rather than half-on.
function installedSequence() {
  try { return Number(JSON.parse(readFileSync(UPDATE_STATE_FILE, 'utf8')).sequence) || 0; }
  catch { return 0; }
}
const updates = activation && RELEASE_PUBLIC_KEY_FILE
  ? createUpdateService({
      activation,
      controlClient: createControlPlaneClient({ baseUrl: CONTROL_URL }),
      releasePublicKey: readFileSync(RELEASE_PUBLIC_KEY_FILE, 'utf8'),
      root: ROOT.replace(/\/$/, ''),
      stateFile: UPDATE_STATE_FILE,
      // A core release carries the shell only. The professional accounts the
      // owner installed live in apps/ and runtime/ under the same root, so an
      // update that did not carry them across would uninstall them.
      preserve: ['data', 'apps', 'runtime'],
      currentSequence: installedSequence(),
      downloadAsset: createAssetDownloader({ controlUrl: CONTROL_URL, activation }),
      extract: extractArchive,
      healthCheck: createHealthCheck(),
      // The new tree is already in place; leaving lets the service manager
      // start it. Restart=always in the unit is what completes the update.
      onApplied: () => { setTimeout(() => process.exit(0), 1000).unref(); },
    })
  : null;
// Professional accounts run as separate loopback services; this server is the
// only way in and it forwards a request only after the SYC-AI session checks out.
const CODEX_PORT = Number(process.env.FREE_CODEX_PORT || 8785);
// The right-to-left stylesheets too: Persian and Arabic swap to them, and without
// them Codex Web opened unstyled in both (found 2026-09-24).
const CODEX_STATIC = new Set(['/app.js', '/app.css', '/app.rtl.css', '/boot.js', '/command-center.js', '/command-center.css', '/command-center.rtl.css', '/transcript-view.js']);

const CLAUDE_PORT = Number(process.env.FREE_CLAUDE_PORT || 8786);
const KIMI_PORT = Number(process.env.FREE_KIMI_PORT || 8788);
const GEMINI_PORT = Number(process.env.FREE_GEMINI_PORT || 8789);
const QWEN_PORT = Number(process.env.FREE_QWEN_PORT || 8794);
const CURSOR_PORT = Number(process.env.FREE_CURSOR_PORT || 8796);
const SYC_API_PORT = Number(process.env.FREE_SYC_API_PORT || 8797);

// Professional-account packages are private: the control plane hands out a
// short-lived grant bound to this installation, and the installer redeems it
// for the bytes. The grant is requested with the installation's own key, so a
// long install does not fail because the browser session expired.
const installer = createInstallerRuntime({
  root: ROOT.replace(/\/$/, ''),
  requestDownloadGrant: activation
    ? async ({ panelId, releaseSequence }) => {
        const signer = await activation.signer();
        const response = await createControlPlaneClient({ baseUrl: CONTROL_URL })
          .call('installationDownloadGrant', { installation: signer, body: { panelId, releaseSequence } });
        if (response.status !== 200 || !response.body?.data) {
          throw new Error(response.body?.error || 'download grant unavailable');
        }
        return { ...response.body.data, installationId: signer.installationId };
      }
    : undefined,
});
const { panelsStatus, installPanelStream } = installer;

// The phone link and the app this panel hands out.
const APP_DIR = resolve(ROOT, 'app');
const deviceLink = createDeviceLink({ dataDir: DATA_DIR, appDir: APP_DIR });

function proxyToApp(port, label, req, res, user, targetPath) {
  // The panel language travels with every proxied request, so a panel can also
  // answer in it — the profile value when the user saved one, otherwise the
  // language this browser is showing.
  const browserLang = /(?:^|;\s*)syc-lang=(en|zh|es|ar|ru|fa)\b/.exec(req.headers.cookie || '')?.[1];
  const headers = {
    ...req.headers,
    host: `127.0.0.1:${port}`,
    'x-syc-user': user.username,
    'x-syc-lang': user.language || browserLang || '',
  };
  delete headers.cookie;
  const upstream = httpRequest({ host: '127.0.0.1', port, method: req.method, path: targetPath, headers }, (up) => {
    const out = { ...up.headers };
    res.writeHead(up.statusCode || 502, out);
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) json(res, 502, { error: `${label} is starting. Try again in a moment.` });
    else res.end();
  });
  req.pipe(upstream);
}

// Hosted mode (syc-ai.com): every user gets their own instance of each
// professional-account app, started on demand — see tenant-apps.mjs. The
// classic self-host install keeps one shared instance per app on fixed ports.
const HOSTED = process.env.SYC_AI_HOSTED === '1';
const tenants = HOSTED ? createTenantApps({ root: ROOT, dataRoot: DATA_DIR }) : null;
// Per-user app processes are children of this one: take them down with it,
// or a restart leaves orphans holding their ports and the users' data files.
if (tenants) for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { tenants.stopAll(); setTimeout(() => process.exit(0), 300); });
async function proxyToTenant(app, label, req, res, user, targetPath) {
  let lease;
  try { lease = await tenants.acquire(user.username, app); }
  catch (error) {
    if (error.status === 503) {
      // Every workspace on this server is busy: say so plainly, never a stack trace.
      res.setHeader('Retry-After', String(error.retryAfter || 60));
      if (String(req.headers.accept || '').includes('text/html')) {
        res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SYC-AI is busy</title><link rel="stylesheet" href="/v2.css"></head><body class="busy-page"><main class="busy-card"><img src="/assets/syc-logo.svg" alt="" width="64" height="64"><h1>Many people are starting SYC-AI right now</h1><p>Your workspace is safe. Please try again in a minute.</p><p><a class="button" href="">Try again</a> <a class="button ghost" href="/main">Back to the panel</a></p></main></body></html>`);
      }
      return json(res, 503, { error: 'capacity_full', message: 'Many people are starting SYC-AI right now. Your workspace is safe; please try again in a minute.', retryAfter: error.retryAfter || 60 });
    }
    return json(res, error.status || 502, { error: `${label} could not start (${error.message}).` });
  }
  res.once('close', lease.release);
  return proxyToApp(lease.port, label, req, res, user, targetPath);
}
const proxyToCodex = (req, res, user, targetPath) => (HOSTED ? proxyToTenant('codex', 'Codex Web', req, res, user, targetPath) : proxyToApp(CODEX_PORT, 'Codex Web', req, res, user, targetPath));
// Claude Web asks for everything relative to its own prefix, so the whole
// subtree forwards with the prefix stripped.
const proxyToClaude = (req, res, user, targetPath) => (HOSTED ? proxyToTenant('claude', 'Claude Web', req, res, user, targetPath) : proxyToApp(CLAUDE_PORT, 'Claude Web', req, res, user, targetPath));
// Kimi's frontend rewrites its own paths under /profage/<name>/ before the
// request leaves the browser, so the prefix is stripped again here — the panel
// itself serves everything at the root, exactly as on the main panel.
const proxyToKimi = (req, res, user, targetPath) => proxyToApp(KIMI_PORT, 'Kimi Web', req, res, user, targetPath);
const proxyToGemini = (req, res, user, targetPath) => proxyToApp(GEMINI_PORT, 'Gemini Web', req, res, user, targetPath);
const proxyToQwen = (req, res, user, targetPath) => proxyToApp(QWEN_PORT, 'Qwen Web', req, res, user, targetPath);
const proxyToCursor = (req, res, user, targetPath) => proxyToApp(CURSOR_PORT, 'Cursor Web', req, res, user, targetPath);
const proxyToSycApi = (req, res, user, targetPath) => proxyToApp(SYC_API_PORT, 'SYC-API', req, res, user, targetPath);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function secret() {
  if (!existsSync(SECRET_FILE)) writeFileSync(SECRET_FILE, randomBytes(48).toString('hex'), { mode: 0o600 });
  return readFileSync(SECRET_FILE, 'utf8').trim();
}
const SECRET = secret();

// --- Two-factor authentication (TOTP, RFC 6238) -------------------------------
// Secrets are stored AES-256-GCM encrypted with a key that lives only in data/.
const TOTP_KEY_FILE = join(DATA_DIR, 'totp-key');
const TOTP_KEY = (() => {
  if (!existsSync(TOTP_KEY_FILE)) writeFileSync(TOTP_KEY_FILE, randomBytes(32).toString('base64url'), { mode: 0o600 });
  return Buffer.from(readFileSync(TOTP_KEY_FILE, 'utf8').trim(), 'base64url');
})();
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buffer) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(input) {
  let bits = 0, value = 0; const bytes = [];
  for (const ch of String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
function encryptSecret(value) {
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', TOTP_KEY, iv);
  const enc = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decryptSecret(value) {
  try {
    const buf = Buffer.from(String(value || ''), 'base64');
    const d = createDecipheriv('aes-256-gcm', TOTP_KEY, buf.subarray(0, 12)); d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}
function totpCode(secretValue, counter) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretValue)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, '0');
}
function verifyTotp(secretValue, input, afterCounter = -1) {
  const code = String(input || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6 || !secretValue) return null;
  const now = Math.floor(Date.now() / 30_000);
  for (const offset of [0, -1, 1]) {
    const counter = now + offset;
    if (counter <= afterCounter) continue;
    if (timingSafeEqual(Buffer.from(code), Buffer.from(totpCode(secretValue, counter)))) return counter;
  }
  return null;
}
const qrSvg = (text) => new Promise((ok, fail) => execFile('/usr/bin/qrencode', ['-t', 'SVG', '-m', '1', '-s', '6', '-o', '-', text], { timeout: 5000 }, (e, out) => (e ? fail(e) : ok(out))));

const loadUsers = () => { try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); } catch { return { users: [] }; } };

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(String(password), salt, 64).toString('hex') };
}
function verifyPassword(password, user) {
  if (!user?.salt || !user?.hash) return false;
  const a = Buffer.from(scryptSync(String(password), user.salt, 64).toString('hex'), 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Stateless signed session: username|expiry|nonce|hmac. A password change
// rotates the user's `sessionEpoch`, which invalidates every earlier cookie.
function sign(value) { return createHmac('sha256', SECRET).update(value).digest('base64url'); }
function makeToken(user) {
  const body = [user.username, Date.now() + SESSION_TTL, user.sessionEpoch || 0, randomBytes(9).toString('base64url')].join('|');
  return `${Buffer.from(body).toString('base64url')}.${sign(body)}`;
}
function readToken(token) {
  const [b64, mac] = String(token || '').split('.');
  if (!b64 || !mac) return null;
  const body = Buffer.from(b64, 'base64url').toString();
  const expected = sign(body);
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  const [username, expires, epoch] = body.split('|');
  if (Number(expires) < Date.now()) return null;
  const user = loadUsers().users.find((u) => u.username === username);
  if (!user || String(user.sessionEpoch || 0) !== epoch) return null;
  return user;
}
function publicProfile(u) {
  const { username, role, displayName, firstName, lastName, phone, address, avatar, avatarUrl, updatedAt, language } = u;
  return { username, role, displayName, firstName, lastName, phone, address, avatar, avatarUrl, language: language || null, twoFactorEnabled: u.twoFactorEnabled === true, passwordChangedAt: updatedAt || null };
}
const cookieUser = (req) => readToken(/(?:^|;\s*)sycfree=([^;]+)/.exec(req.headers.cookie || '')?.[1]);

// Simple per-IP login throttle on top of nginx's limit_req.
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  attempts.set(ip, list);
  return list.length >= 10;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, code, value, headers = {}) => send(res, code, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

function serveFile(res, rel, extraHeaders = {}) {
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR) || !existsSync(file)) return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
  const type = TYPES[extname(file)] || 'application/octet-stream';
  const cache = extname(file) === '.html' ? 'no-store' : 'public, max-age=3600';
  send(res, 200, readFileSync(file), { 'Content-Type': type, 'Cache-Control': cache, ...extraHeaders });
}

function readBody(req, limit = 10_000) {
  return new Promise((resolveBody, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolveBody(data ? JSON.parse(data) : {}); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

// Hosted panel: the phone (SYC Claw) is a device of the central account, signed
// in at syc-ai.com; its state lives in the control plane.
const hostedControl = HOSTED_CONTROL_CLIENT();
function HOSTED_CONTROL_CLIENT() { return CONTROL_URL ? createControlPlaneClient({ baseUrl: CONTROL_URL }) : null; }
async function hostedPhoneRoute(req, res, path) {
  // Changes come only from this panel's own pages (the control plane's CSRF
  // check sees the token we forward, so the origin is checked here).
  if (req.method !== 'GET' && req.headers.origin !== new URL(PUBLIC_ORIGIN).origin) return json(res, 403, { error: 'origin_forbidden' });
  const context = {
    cookieHeader: req.headers.cookie || '',
    csrfToken: /(?:^|;\s*)syc_csrf=([^;]+)/.exec(req.headers.cookie || '')?.[1] || '',
    clientAddress: String(req.headers['x-real-ip'] || req.socket.remoteAddress || ''),
    userAgent: req.headers['user-agent'] || '',
  };
  const list = await hostedControl.call('devices', context);
  const phones = (list.body?.data || []).filter((d) => d.platform === 'android' && !d.revokedAt);
  const phone = phones[phones.length - 1] || null;
  if (path === '/api/connection/android' && req.method === 'GET') {
    const requests = phone ? await hostedControl.call('phoneRequests', context).catch(() => null) : null;
    const permissions = await hostedControl.call('phonePermissions', context).catch(() => null);
    return json(res, 200, {
      app: deviceLink.appRelease(),
      device: phone && { id: phone.id, name: phone.name, online: phone.online, app: String(phone.agentVersion || '').startsWith('app'), accessibility: String(phone.agentVersion || '').includes('+a11y'), permissions: permissions?.body?.data || {}, lastSeenAt: phone.lastSeenAt },
      requests: requests?.body?.data || [],
      hosted: true,
    });
  }
  if (path === '/api/connection/android/revoke' && req.method === 'POST') {
    if (!phone) return json(res, 404, { error: 'No phone is connected.' });
    const result = await hostedControl.call('deviceRevoke', { ...context, body: { deviceId: phone.id } });
    return json(res, result.status === 200 ? 200 : result.status, result.status === 200 ? { ok: true } : result.body);
  }
  // The SYC-AI Android app links the phone it runs on (from this signed-in page).
  if (path === '/api/connection/android/link' && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    const result = await hostedControl.call('phoneLink', { ...context, body: { name: String(body.name || 'Phone').slice(0, 60), androidVersion: String(body.androidVersion || '').slice(0, 12) } });
    return json(res, result.status === 200 ? 200 : result.status, result.status === 200 ? result.body.data : result.body);
  }
  // The user decides what agents may hand to the phone (Connection → Android).
  if (path === '/api/connection/android/permissions' && req.method === 'PUT') {
    const body = await readBody(req).catch(() => ({}));
    const result = await hostedControl.call('phonePermissionsSet', { ...context, body: { permissions: body.permissions || {} } });
    return json(res, result.status === 200 ? 200 : result.status, result.status === 200 ? { permissions: result.body.data } : result.body);
  }
  return json(res, 404, { error: 'not_found' });
}

async function hostedAccountsRoute(req, res, url, user) {
  const path = url.pathname;
  const fail = (error) => json(res, error.status || 502, { error: error.message || 'failed', ...(error.detail ? { detail: error.detail } : {}) });
  try {
    if (req.method === 'POST' && req.headers.origin !== new URL(PUBLIC_ORIGIN).origin) return json(res, 403, { error: 'origin_forbidden' });
    if (path === '/api/hosted/accounts' && req.method === 'GET') {
      const devices = await deviceAccounts.devicesFor(user.username);
      const fresh = url.searchParams.get('fresh') === '1';
      const list = await Promise.all(devices.map(async (d) => {
        const accounts = {};
        await Promise.all([...Object.keys(deviceAccounts.DEVICE_ACCOUNTS), ...Object.keys(deviceAccounts.SECOND_ACCOUNTS)].map(async (app) => {
          accounts[app] = await (fresh ? deviceAccounts.accountStatus(user.username, d.deviceId, app, { fresh }) : deviceAccounts.accountStatusQuick(user.username, d.deviceId, app)).catch((e) => ({ app, error: e.message }));
        }));
        return { deviceId: d.deviceId, name: d.name, platform: d.platform, accounts };
      }));
      return json(res, 200, { devices: list, apps: Object.fromEntries(Object.entries(deviceAccounts.DEVICE_ACCOUNTS).map(([k, v]) => [k, { name: v.name }])) });
    }
    let m;
    if ((m = /^\/api\/hosted\/accounts\/([a-z]+)\/install$/.exec(path)) && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('step', { text: 'Installing on your device…' });
      try {
        const status = await deviceAccounts.installAccount(user.username, String(body.deviceId || ''), m[1], (text) => send('log', { text }));
        send('done', status);
      } catch (error) { send('fail', { error: error.message, detail: error.detail || '' }); }
      return res.end();
    }
    if ((m = /^\/api\/hosted\/accounts\/([a-z]+(?:-2)?)\/login$/.exec(path)) && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      return json(res, 200, await deviceAccounts.startLogin(user.username, String(body.deviceId || ''), m[1]));
    }
    if ((m = /^\/api\/hosted\/logins\/([0-9a-f-]{36})\/code$/.exec(path)) && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      return json(res, 200, await deviceAccounts.finishLogin(user.username, m[1], String(body.code || '')));
    }
    if ((m = /^\/api\/hosted\/logins\/([0-9a-f-]{36})$/.exec(path)) && req.method === 'GET') {
      return json(res, 200, await deviceAccounts.loginState(user.username, m[1]));
    }
    return json(res, 404, { error: 'not_found' });
  } catch (error) { return res.headersSent ? res.end() : fail(error); }
}

// SYC-AI (All in One): one session for every engine the user signed in on
// their device — see all-in-one.mjs. Skills ship inside the release (skills/),
// pinned and reviewed, so nothing is fetched from the internet at run time.
const SKILLS_DIR = resolve(ROOT, 'skills');
const allInOne = HOSTED ? createAllInOne({
  dataDir: DATA_DIR,
  devicesFor: deviceAccounts.devicesFor,
  accountStatusQuick: deviceAccounts.accountStatusQuick,
  spawn: spawnOnDevice,
  deviceFs,
  alert: phoneAlertFor,
  fetchSkillFile: async (skill) => {
    const dir = join(SKILLS_DIR, skill.id);
    return readdirSync(dir).map((name) => ({ name, content: readFileSync(join(dir, name), 'utf8') }));
  },
}) : null;
const IDEA_IDS = new Set(IDEAS.map((idea) => idea.id));
const ideaClicksFile = join(DATA_DIR, 'syc-idea-clicks.json');

async function allInOneRoute(req, res, url, user) {
  const path = url.pathname;
  if (req.method === 'POST') {
    let sameOrigin = false;
    try { sameOrigin = PUBLIC_ORIGIN ? req.headers.origin === new URL(PUBLIC_ORIGIN).origin : new URL(req.headers.origin).host === req.headers.host; } catch { /* no or bad Origin */ }
    if (!sameOrigin) return json(res, 403, { error: 'origin_forbidden' });
  }
  // "What's coming" boxes: count opens per box (no personal data), in either mode.
  let m;
  if ((m = /^\/api\/syc\/ideas\/([a-z-]{2,40})$/.exec(path)) && req.method === 'POST') {
    if (!IDEA_IDS.has(m[1])) return json(res, 404, { error: 'not_found' });
    // Hosted: the control plane keeps the count so the console can show it.
    if (HOSTED && await countIdea(m[1])) return json(res, 200, { ok: true });
    let clicks = {};
    try { clicks = JSON.parse(readFileSync(ideaClicksFile, 'utf8')); } catch { /* first click */ }
    clicks[m[1]] = (clicks[m[1]] || 0) + 1;
    try { writeFileSync(ideaClicksFile, JSON.stringify(clicks), { mode: 0o600 }); } catch { /* counting is best effort */ }
    return json(res, 200, { ok: true });
  }
  if (!allInOne) return json(res, 409, { error: 'hosted_only' });
  const username = user.username;
  try {
    if (path === '/api/syc/state' && req.method === 'GET') return json(res, 200, await allInOne.state(username, { deviceId: url.searchParams.get('device') || '' }));
    if (path === '/api/syc/settings' && req.method === 'POST') return json(res, 200, { settings: allInOne.saveSettings(username, await readBody(req, 64 * 1024)) });
    if (path === '/api/syc/suggest' && req.method === 'POST') return json(res, 200, suggestPriority((await readBody(req, 16 * 1024)).text));
    if (path === '/api/syc/usage/refresh' && req.method === 'POST') return json(res, 200, { usage: await allInOne.refreshUsage(username, String((await readBody(req)).deviceId || '')) });
    if (path === '/api/syc/sessions' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, { session: allInOne.createSession(username, { title: body.title, templateId: body.template || null, deviceId: body.deviceId || null }) });
    }
    if ((m = /^\/api\/syc\/templates\/([a-z-]{2,40})\/download$/.exec(path)) && req.method === 'GET') {
      return send(res, 200, allInOne.templateDownload(m[1]), { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="AGENTS-${m[1]}.md"` });
    }
    if ((m = /^\/api\/syc\/sessions\/([0-9a-f-]{36})(?:\/(send|stop|delete|rename|events))?$/.exec(path))) {
      const [, id, action] = m;
      if (!action && req.method === 'GET') return json(res, 200, { session: allInOne.loadSession(username, id), running: allInOne.isRunning(username, id) });
      if (action === 'events' && req.method === 'GET') {
        allInOne.loadSession(username, id);
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        emit('hello', { running: allInOne.isRunning(username, id) });
        const off = allInOne.subscribe(username, id, emit);
        const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20_000);
        res.once('close', () => { clearInterval(keepAlive); off(); });
        return undefined;
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
      const body = await readBody(req, 256 * 1024);
      if (action === 'send') {
        const { turn } = await allInOne.sendMessage(username, id, { text: body.text, engine: body.engine, deviceId: body.deviceId });
        return json(res, 202, { turn });
      }
      if (action === 'stop') return json(res, 200, { stopped: allInOne.stop(username, id) });
      if (action === 'delete') { allInOne.deleteSession(username, id); return json(res, 200, { ok: true }); }
      if (action === 'rename') return json(res, 200, { session: allInOne.renameSession(username, id, body.title) });
    }
    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    return res.headersSent ? res.end() : json(res, error.status || 500, { error: error.message || 'failed' });
  }
}

// For the SYC-AI console (dev.sycc.ir → a customer → Activity): what this user
// did inside the hosted panel. Loopback only, with the hub secret; nginx never
// forwards /internal/ from the internet.
function readJsonFile(file, fallback) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } }
function treeInfo(dir, depth = 0) {
  let bytes = 0; let files = 0; let newest = 0;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return { bytes, files, newest }; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { if (depth < 6) { const sub = treeInfo(full, depth + 1); bytes += sub.bytes; files += sub.files; newest = Math.max(newest, sub.newest); } continue; }
    try { const st = statSync(full); bytes += st.size; files += 1; newest = Math.max(newest, st.mtimeMs); } catch { /* vanished */ }
  }
  return { bytes, files, newest };
}
function panelUserActivity(username) {
  const base = join(DATA_DIR, 'users', username);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(username) || !existsSync(base)) return null;
  const claudeSessions = (() => { try { return readdirSync(join(base, 'claude', 'data', 'sessions')).filter((f) => f.endsWith('.json')); } catch { return []; } })()
    .map((f) => readJsonFile(join(base, 'claude', 'data', 'sessions', f), null)).filter(Boolean);
  const claudeUsage = claudeSessions.reduce((sum, s) => ({ input: sum.input + (s.usage?.inputTokens || 0), output: sum.output + (s.usage?.outputTokens || 0) }), { input: 0, output: 0 });
  const codexHome = treeInfo(join(base, 'codex', 'home', 'sessions'));
  const aioSessions = (() => { try { return readdirSync(join(base, 'syc', 'sessions')).filter((f) => f.endsWith('.json')); } catch { return []; } })()
    .map((f) => readJsonFile(join(base, 'syc', 'sessions', f), null)).filter(Boolean);
  const aioTurns = aioSessions.flatMap((s) => s.turns || []);
  const storage = treeInfo(base);
  return {
    username,
    storageBytes: storage.bytes, lastActivityAt: storage.newest ? new Date(storage.newest).toISOString() : null,
    claude: {
      sessions: claudeSessions.length, messages: claudeSessions.reduce((n, s) => n + (s.messages?.length || 0), 0),
      tokensIn: claudeUsage.input, tokensOut: claudeUsage.output,
      lastSessionAt: claudeSessions.reduce((m, s) => Math.max(m, Number(s.updatedAt) || 0), 0) || null,
      titles: claudeSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5).map((s) => String(s.title || '').slice(0, 80)),
    },
    codex: { conversationFiles: codexHome.files, lastActivityAt: codexHome.newest ? new Date(codexHome.newest).toISOString() : null },
    allInOne: {
      sessions: aioSessions.length, messages: aioTurns.filter((t) => t.role === 'user').length,
      answersBy: aioTurns.filter((t) => t.role === 'assistant').reduce((m, t) => ({ ...m, [t.engine]: (m[t.engine] || 0) + 1 }), {}),
      limitTakeovers: aioTurns.filter((t) => t.reason === 'fallback').length,
      settings: (() => { const st = readJsonFile(join(base, 'syc', 'settings.json'), {}); return { permissions: st.permissions || 'edit', tokenSaver: st.tokenSaver !== false, accounts: st.accounts || null }; })(),
      usage: readJsonFile(join(base, 'syc', 'usage.json'), {}),
    },
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');

  try {
    const internalUser = /^\/internal\/panel\/users\/([^/]+)$/.exec(path);
    if (internalUser) {
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      const secret = process.env.SYC_HUB_SECRET || '';
      if (!loopback || !secret || req.headers['x-syc-hub'] !== secret) return json(res, 403, { error: 'forbidden' });
      const data = panelUserActivity(decodeURIComponent(internalUser[1]));
      return data ? json(res, 200, { data }) : json(res, 404, { error: 'no_panel_data' });
    }
    if (onboarding && path.startsWith('/api/onboarding/')) {
      const body = req.method === 'POST' ? await readBody(req, 64 * 1024).catch(() => null) : undefined;
      if (req.method === 'POST' && body === null) return json(res, 400, { error: 'invalid_request' });
      const result = await onboarding.dispatch({
        method: req.method,
        pathname: path,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        body,
        clientAddress: ip,
      });
      if (!result) return json(res, 404, { error: 'not_found' });
      const headers = result.setCookies?.length ? { 'Set-Cookie': result.setCookies } : {};
      // Sign in with Google / GitHub: a redirect to the provider, or the small
      // page that continues after it (see onboarding-server.mjs).
      if (result.redirect) return send(res, 302, '', { ...headers, Location: result.redirect, 'Cache-Control': 'no-store' });
      if (result.html) return send(res, result.status, result.html, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return json(res, result.status, result.body, headers);
    }
    if (onboarding && path === '/auth/me' && req.method === 'GET') {
      const authorization = await onboarding.authorize({
        cookieHeader: req.headers.cookie || '', clientAddress: ip,
        userAgent: req.headers['user-agent'] || '', allowRestricted: true,
      });
      return authorization.authorized
        ? json(res, 200, { user: authorization.user, access: authorization.access })
        : json(res, 401, { error: authorization.reason });
    }
    if (onboarding && path === '/auth/profile' && req.method === 'GET') {
      const authorization = await onboarding.authorize({
        cookieHeader: req.headers.cookie || '', clientAddress: ip,
        userAgent: req.headers['user-agent'] || '', allowRestricted: true,
      });
      return authorization.authorized
        ? json(res, 200, { user: authorization.user, access: authorization.access })
        : json(res, 401, { error: authorization.reason });
    }
    // The update endpoints stay reachable in restricted mode on purpose: a
    // panel locked by a failed required release must still be able to try
    // again and show the owner why it is locked.
    if (onboarding && (path === '/api/updates/status' || path === '/api/updates/check')) {
      const authorization = await onboarding.authorize({
        cookieHeader: req.headers.cookie || '', clientAddress: ip,
        userAgent: req.headers['user-agent'] || '', allowRestricted: true,
      });
      if (!authorization.authorized) return json(res, 401, { error: authorization.reason });
      if (!updates) return json(res, 503, { error: 'update_channel_unavailable' });
      if (path === '/api/updates/status') return json(res, 200, updates.status());
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
      try { return json(res, 200, await updates.check()); }
      catch (error) { return json(res, 502, { error: String(error?.code || 'control_unavailable') }); }
    }
    if (onboarding && path.startsWith('/auth/')) {
      return json(res, 409, { error: 'central_account_required' });
    }
    if (path === '/auth/login' && req.method === 'POST') {
      if (throttled(ip)) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      const body = await readBody(req).catch(() => ({}));
      const user = loadUsers().users.find((u) => u.username === String(body.username || '').trim());
      if (!user || !verifyPassword(body.password, user)) {
        attempts.get(ip).push(Date.now());
        return json(res, 401, { error: 'Incorrect username or password.' });
      }
      if (user.twoFactorEnabled) {
        const secretValue = decryptSecret(user.twoFactorSecret);
        if (!String(body.otp || '').trim()) return json(res, 202, { requiresTwoFactor: true });
        const counter = verifyTotp(secretValue, body.otp, user.twoFactorLastCounter ?? -1);
        if (counter === null) { attempts.get(ip).push(Date.now()); return json(res, 401, { error: 'The one-time code is incorrect.' }); }
        const data = loadUsers(); const rec = data.users.find((u) => u.username === user.username);
        rec.twoFactorLastCounter = counter; writeUsers(data);
      }
      attempts.delete(ip);
      return json(res, 200, { ok: true }, {
        'Set-Cookie': `${COOKIE}=${makeToken(user)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}`,
      });
    }
    if (path === '/auth/logout' && req.method === 'POST') {
      return json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    }
    if (path.startsWith('/auth/profile')) {
      const user = cookieUser(req);
      if (!user) return json(res, 401, { error: 'login_required' });
      if (path === '/auth/profile' && req.method === 'GET') return json(res, 200, { user: publicProfile(user) });
      // The language chosen in one browser follows the user to the next one.
      if (path === '/auth/profile' && req.method === 'PATCH') {
        const body = await readBody(req, 4_000).catch(() => null);
        const language = String(body?.language || '');
        if (!/^(en|zh|es|ar|ru|fa)$/.test(language)) return json(res, 400, { error: 'Unknown language.' });
        const data = loadUsers();
        const record = data.users.find((u) => u.username === user.username);
        if (!record) return json(res, 404, { error: 'Unknown user.' });
        record.language = language;
        writeUsers(data);
        return json(res, 200, { language });
      }
      if (path === '/auth/profile' && req.method === 'POST') {
        const body = await readBody(req, 3_000_000).catch(() => null);
        if (!body) return json(res, 400, { error: 'Invalid request.' });
        const clean = (value, max) => String(value || '').trim().slice(0, max);
        const data = loadUsers();
        const record = data.users.find((u) => u.username === user.username);
        Object.assign(record, {
          displayName: clean(body.displayName, 60), firstName: clean(body.firstName, 50), lastName: clean(body.lastName, 60),
          phone: clean(body.phone, 24), address: clean(body.address, 300), avatar: clean(body.avatar, 12),
        });
        if (body.avatarDataUrl) {
          const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.avatarDataUrl));
          if (!m || Buffer.from(m[2], 'base64').length > 2 * 1024 * 1024) return json(res, 400, { error: 'The picture must be PNG, JPG or WebP and at most 2 MB.' });
          record.avatarUrl = body.avatarDataUrl;
        }
        writeUsers(data);
        return json(res, 200, { user: publicProfile(record) });
      }
      if (path === '/auth/profile/password' && req.method === 'POST') {
        const body = await readBody(req).catch(() => ({}));
        if (!verifyPassword(body.currentPassword, user)) return json(res, 403, { error: 'The current password is incorrect.' });
        const next = String(body.newPassword || '');
        if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next) || !/[^A-Za-z0-9]/.test(next)) {
          return json(res, 400, { error: 'Use at least 8 characters with a letter, a number and a symbol.' });
        }
        const data = loadUsers();
        const record = data.users.find((u) => u.username === user.username);
        Object.assign(record, hashPassword(next), { sessionEpoch: (record.sessionEpoch || 0) + 1, updatedAt: new Date().toISOString() });
        writeUsers(data);
        // Other sessions die with the old epoch; this browser gets a fresh cookie.
        return json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=${makeToken(record)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}` });
      }
      if (path === '/auth/profile/sessions/revoke' && req.method === 'POST') {
        const data = loadUsers(); const rec = data.users.find((u) => u.username === user.username);
        rec.sessionEpoch = (rec.sessionEpoch || 0) + 1; writeUsers(data);
        return json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=${makeToken(rec)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}` });
      }
      if (path === '/auth/profile/2fa/start' && req.method === 'POST') {
        const body = await readBody(req).catch(() => ({}));
        if (user.twoFactorEnabled) return json(res, 409, { error: 'Two-factor authentication is already on.' });
        if (!verifyPassword(body.currentPassword, user)) return json(res, 403, { error: 'The current password is incorrect.' });
        const secretValue = base32Encode(randomBytes(20));
        const data = loadUsers(); const rec = data.users.find((u) => u.username === user.username);
        rec.twoFactorPendingSecret = encryptSecret(secretValue); rec.twoFactorPendingExpiresAt = Date.now() + 10 * 60_000; writeUsers(data);
        return json(res, 200, { secret: secretValue, qrUrl: `/auth/profile/2fa/qr?v=${Date.now()}` });
      }
      if (path === '/auth/profile/2fa/qr' && req.method === 'GET') {
        const pending = user.twoFactorPendingExpiresAt > Date.now() ? decryptSecret(user.twoFactorPendingSecret) : null;
        if (!pending) return json(res, 404, { error: 'The setup request expired.' });
        const uri = `otpauth://totp/${encodeURIComponent(`SYC:${user.username}`)}?secret=${pending}&issuer=SYC&algorithm=SHA1&digits=6&period=30`;
        try { return send(res, 200, await qrSvg(uri), { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' }); }
        catch { return json(res, 500, { error: 'Could not create the QR code.' }); }
      }
      if (path === '/auth/profile/2fa/enable' && req.method === 'POST') {
        const body = await readBody(req).catch(() => ({}));
        const pending = user.twoFactorPendingExpiresAt > Date.now() ? decryptSecret(user.twoFactorPendingSecret) : null;
        if (!pending) return json(res, 400, { error: 'The setup request expired. Start again.' });
        const counter = verifyTotp(pending, body.code);
        if (counter === null) return json(res, 400, { error: 'The code is incorrect.' });
        const data = loadUsers(); const rec = data.users.find((u) => u.username === user.username);
        Object.assign(rec, { twoFactorEnabled: true, twoFactorSecret: encryptSecret(pending), twoFactorLastCounter: counter });
        delete rec.twoFactorPendingSecret; delete rec.twoFactorPendingExpiresAt; writeUsers(data);
        return json(res, 200, { user: publicProfile(rec) });
      }
      if (path === '/auth/profile/2fa/disable' && req.method === 'POST') {
        const body = await readBody(req).catch(() => ({}));
        if (!user.twoFactorEnabled) return json(res, 409, { error: 'Two-factor authentication is already off.' });
        if (!verifyPassword(body.currentPassword, user)) return json(res, 403, { error: 'The current password is incorrect.' });
        if (verifyTotp(decryptSecret(user.twoFactorSecret), body.code) === null) return json(res, 400, { error: 'The code is incorrect.' });
        const data = loadUsers(); const rec = data.users.find((u) => u.username === user.username);
        for (const k of ['twoFactorEnabled', 'twoFactorSecret', 'twoFactorLastCounter']) delete rec[k];
        writeUsers(data);
        return json(res, 200, { user: publicProfile(rec) });
      }
      return json(res, 404, { error: 'not_found' });
    }
    if (onboarding && (path === '/api/device/login' || path === '/api/device/heartbeat')) {
      const decision = centralRouteDecision({ pathname: path, authorization: null });
      return json(res, decision.status, { error: decision.reason });
    }
    // --- The phone app's own endpoints ---------------------------------------
    // No panel session here: the SYC Claw app signs in with the panel's own
    // username and password, receives a device token, and authenticates with
    // that token afterwards.
    if (path === '/api/device/login' && req.method === 'POST') {
      if (throttled(ip)) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      const body = await readBody(req).catch(() => ({}));
      const user = loadUsers().users.find((u) => u.username === String(body.username || '').trim());
      if (!user || !verifyPassword(body.password, user)) {
        attempts.get(ip).push(Date.now());
        return json(res, 401, { error: 'Incorrect username or password.' });
      }
      if (user.twoFactorEnabled) {
        const secretValue = decryptSecret(user.twoFactorSecret);
        if (!String(body.otp || '').trim()) return json(res, 202, { requiresTwoFactor: true });
        const counter = verifyTotp(secretValue, body.otp, user.twoFactorLastCounter ?? -1);
        if (counter === null) { attempts.get(ip).push(Date.now()); return json(res, 401, { error: 'The one-time code is incorrect.' }); }
        const data = loadUsers(); const rec = data.users.find((u) => u.username === user.username);
        rec.twoFactorLastCounter = counter; writeUsers(data);
      }
      attempts.delete(ip);
      const result = deviceLink.enroll({
        owner: user.username,
        name: body.name,
        model: body.model,
        androidVersion: body.androidVersion,
      });
      return json(res, 200, { token: result.token, device: result.device });
    }
    if (path === '/api/device/heartbeat' && req.method === 'POST') {
      const token = String(req.headers['x-device-token'] || '');
      const body = await readBody(req).catch(() => ({}));
      const result = deviceLink.heartbeat(token, body || {});
      return json(res, result.status, result.error ? { error: result.error } : { device: result.device, permissions: result.permissions });
    }

    if (path === '/auth/me') {
      const user = cookieUser(req);
      return user ? json(res, 200, { user: publicProfile(user) }) : json(res, 401, { error: 'login_required' });
    }
    if (path.startsWith('/auth/')) return json(res, 404, { error: 'not_found' });

    if (path === '/login') return onboarding ? serveFile(res, 'login.html') : (cookieUser(req) ? send(res, 302, '', { Location: '/' }) : serveFile(res, 'login.html'));
    if (path === '/login.js' || path === '/onboarding-state.mjs' || path === '/account-center.mjs' || path === '/main.css' || path === '/v2.css' || path === '/theme.js' || path === '/profile.js' || path === '/i18n.js' || path === '/syc-logo.jpg' || path.startsWith('/assets/')) return serveFile(res, path);

    // Everything else requires a session.
    let user = cookieUser(req);
    if (onboarding) {
      const authorization = await onboarding.authorize({
        cookieHeader: req.headers.cookie || '', clientAddress: ip,
        userAgent: req.headers['user-agent'] || '', allowRestricted: true,
      });
      const decision = centralRouteDecision({
        pathname: path, authorization, updateRestricted: updates?.restricted() === true,
      });
      user = decision.allow ? authorization.user : null;
      if (!decision.allow && decision.status === 403) return json(res, 403, { error: decision.reason });
    }
    if (!user) return send(res, 302, '', { Location: `/login${path === '/' ? '' : `?next=${encodeURIComponent(path)}`}` });
    if (path === '/' || path === '/index.html') return send(res, 302, '', { Location: '/main' });
    if (path === '/main' || path === '/main/') return serveFile(res, 'main.html');
    if (path === '/main.js') return serveFile(res, 'main.js');
    if (path === '/profage' || path === '/profage/') return serveFile(res, 'profage.html');
    if (path === '/profage.js') return serveFile(res, 'profage.js');
    // Connection (phone, computers, servers) and Communications (social
    // accounts). Only the Android part of Connection does anything today.
    if (path === '/connection' || path === '/connection/') return serveFile(res, 'connection.html');
    if (path === '/connection.js') return serveFile(res, 'connection.js');
    if (path === '/connection/android' || path === '/connection/android/') return serveFile(res, 'connection-android.html');
    if (path === '/connection/get' || path === '/connection/get/') return serveFile(res, 'connection-get.html');
    if (path === '/connection-android.js') return serveFile(res, 'connection-android.js');
    if (path === '/connection-get.js') return serveFile(res, 'connection-get.js');
    if (path === '/communications' || path === '/communications/') return serveFile(res, 'communications.html');
    // Features of the paid editions (shown, not usable yet) and the visual guide.
    if (path === '/machines' || path === '/machines/') return serveFile(res, 'machines.html');
    if (path === '/simulators' || path === '/simulators/') return serveFile(res, 'simulators.html');
    if (path === '/locked-page.js') return serveFile(res, 'locked-page.js');
    if (path === '/help' || path === '/help/') return serveFile(res, 'help.html');
    if (path === '/help.js') return serveFile(res, 'help.js');
    if (path === '/communications.js') return serveFile(res, 'communications.js');

    // --- The panel's side of the phone link ----------------------------------
    if (HOSTED && path.startsWith('/api/connection/')) return hostedPhoneRoute(req, res, path);
    if (path === '/api/connection/android' && req.method === 'GET') return json(res, 200, deviceLink.status());
    if (path === '/api/connection/android/permissions' && req.method === 'PUT') {
      const body = await readBody(req).catch(() => ({}));
      const result = deviceLink.setPermissions(body?.permissions || {});
      return json(res, result.status, result.error ? { error: result.error } : { device: result.device });
    }
    if (path === '/api/connection/android/revoke' && req.method === 'POST') {
      const result = deviceLink.revoke();
      return json(res, result.status, result.error ? { error: result.error } : { ok: true });
    }

    // --- SYC-AI (All in One) --------------------------------------------------
    if (path === '/profage/syc') return send(res, 302, '', { Location: '/profage/syc/' });
    if (path === '/profage/syc/') return serveFile(res, 'syc.html');
    if (path === '/syc.js') return serveFile(res, 'syc.js');
    if (path.startsWith('/api/syc/')) return allInOneRoute(req, res, url, user);

    // --- Professional accounts: install on demand ----------------------------
    // Hosted panel: professional accounts are installed and signed in on the customer's own device.
    if (HOSTED && path.startsWith('/api/hosted/')) return hostedAccountsRoute(req, res, url, user);
    // Hosted panel: nothing is installed on our server and the phone link is single-tenant.
    if (HOSTED && path === '/api/panels/install') return json(res, 409, { error: 'hosted_device_required' });
    if (HOSTED && /^\/profage\/(qwen|gemini|cursor|kimi|syc-api)(\/|$)/.test(path)) {
      return path.startsWith('/profage/') && !path.includes('/api/') ? send(res, 302, '', { Location: '/profage' }) : json(res, 409, { error: 'not_available_on_hosted_yet' });
    }
    if (path === '/api/panels/status' && req.method === 'GET') return json(res, 200, HOSTED ? { installable: false, panels: [] } : await panelsStatus());
    if (path === '/api/panels/install' && req.method === 'GET') {
      const id = url.searchParams.get('id') || '';
      return installPanelStream(id, res, { update: url.searchParams.get('update') === '1' });
    }
    if (path === '/connection/android/app.apk' && req.method === 'GET') {
      const release = deviceLink.appRelease();
      if (!release.available) return json(res, 404, { error: 'The app is not published on this panel yet.' });
      const apk = join(APP_DIR, release.file);
      return send(res, 200, readFileSync(apk), {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${release.file}"`,
      });
    }
    // Codex Web (professional account)
    if (path === '/profage/codex') return send(res, 302, '', { Location: `/profage/codex/${url.search}` });
    // Codex's own page asks for its assets at the site root (CODEX_STATIC below),
    // but files added next to the page — `i18n-panel.js` and `i18n/<lang>.json` —
    // are requested relative to `/profage/codex/`, so the whole prefix proxies.
    if (path.startsWith('/profage/codex/')) {
      return proxyToCodex(req, res, user, req.url.slice('/profage/codex'.length) || '/');
    }
    if (path === '/codex' || path === '/codex/') return send(res, 302, '', { Location: '/profage/codex/' });
    // Claude Web (professional account)
    if (path === '/profage/claude') return send(res, 302, '', { Location: `/profage/claude/${url.search}` });
    if (path.startsWith('/profage/claude/')) {
      return proxyToClaude(req, res, user, req.url.slice('/profage/claude'.length) || '/');
    }
    if (path === '/claude' || path === '/claude/') return send(res, 302, '', { Location: '/profage/claude/' });
    // Kimi Web (professional account)
    if (path === '/profage/kimi') return send(res, 302, '', { Location: `/profage/kimi/${url.search}` });
    if (path.startsWith('/profage/kimi/')) {
      return proxyToKimi(req, res, user, req.url.slice('/profage/kimi'.length) || '/');
    }
    if (path === '/kimi' || path === '/kimi/') return send(res, 302, '', { Location: '/profage/kimi/' });
    // Gemini Web (professional account)
    if (path === '/profage/syc-api') return send(res, 302, '', { Location: `/profage/syc-api/${url.search}` });
    if (path.startsWith('/profage/syc-api/')) {
      return proxyToSycApi(req, res, user, req.url.slice('/profage/syc-api'.length) || '/');
    }
    if (path === '/profage/cursor') return send(res, 302, '', { Location: `/profage/cursor/${url.search}` });
    if (path.startsWith('/profage/cursor/')) {
      return proxyToCursor(req, res, user, req.url.slice('/profage/cursor'.length) || '/');
    }
    if (path === '/profage/qwen') return send(res, 302, '', { Location: `/profage/qwen/${url.search}` });
    if (path.startsWith('/profage/qwen/')) {
      return proxyToQwen(req, res, user, req.url.slice('/profage/qwen'.length) || '/');
    }
    if (path === '/profage/gemini') return send(res, 302, '', { Location: `/profage/gemini/${url.search}` });
    if (path.startsWith('/profage/gemini/')) {
      return proxyToGemini(req, res, user, req.url.slice('/profage/gemini'.length) || '/');
    }
    if (path === '/gemini' || path === '/gemini/') return send(res, 302, '', { Location: '/profage/gemini/' });
    if (path.startsWith('/api/') || CODEX_STATIC.has(path)) return proxyToCodex(req, res, user, req.url);
    return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'server_error' });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '127.0.0.1', () => console.log(`SYC-AI listening on 127.0.0.1:${PORT}`));
  // On an installed copy (data/license.json present), register + heartbeat to
  // the management panel. On our own build there is no license file, so this is
  // a no-op and nothing phones home.
  startLegacyEdgeClient({ centralOnboardingEnabled: Boolean(onboarding) }).catch(() => {});
  // Ask what release we should be on at startup and every six hours after.
  updates?.start();
}

export function writeUsers(value) {
  const tmp = `${USERS_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, USERS_FILE);
}
