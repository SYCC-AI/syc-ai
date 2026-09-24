import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

const MAX_JSON_BYTES = 64 * 1024;
const OPERATIONS = Object.freeze({
  catalog: ['GET', '/api/public/catalog'],
  csrf: ['GET', '/api/public/csrf'],
  requestOtp: ['POST', '/api/public/otp/request'],
  signup: ['POST', '/api/public/signup'],
  login: ['POST', '/api/public/login'],
  recoverUsername: ['POST', '/api/public/recovery/username'],
  resetPassword: ['POST', '/api/public/recovery/password'],
  session: ['GET', '/api/user/session'],
  accountExport: ['GET', '/api/user/export'],
  logout: ['POST', '/api/user/logout'],
  installationChallenge: ['POST', '/api/user/installations/challenge'],
  installationComplete: ['POST', '/api/user/installations/complete'],
  installationActivate: ['POST', '/api/user/installations/activate'],
  planActivate: ['POST', '/api/user/plan/activate'],
  devices: ['GET', '/api/user/devices'],
  deviceRevoke: ['POST', '/api/user/devices/revoke'],
  phoneRequests: ['GET', '/api/user/phone/requests'],
  phonePermissions: ['GET', '/api/user/phone/permissions'],
  phonePermissionsSet: ['POST', '/api/user/phone/permissions/update'],
  phoneLink: ['POST', '/api/user/phone/link'],
  passwordChange: ['POST', '/api/user/password'],
  entitlementIssue: ['POST', '/api/user/entitlements/issue'],
  downloadGrant: ['POST', '/api/user/downloads/grant'],
  announcements: ['GET', '/api/user/announcements'],
  ticketList: ['GET', '/api/user/tickets'],
  ticketCreate: ['POST', '/api/user/tickets'],
  ticketThread: ['GET', 'ticket'],
  ticketReply: ['POST', 'ticket-reply'],
  oauthStart: ['POST', '/api/public/oauth/start'],
  oauthCallback: ['POST', '/api/public/oauth/callback'],
  oauthTicket: ['GET', '/api/public/oauth/ticket'],
  oauthComplete: ['POST', '/api/public/oauth/complete'],
  releaseCurrent: ['GET', '/api/installation/releases/current'],
  installationDownloadGrant: ['POST', '/api/installation/downloads/grant'],
});
// Operations the installation signs for itself, with no user session behind
// them. The update check has to keep working while nobody is logged in.
const INSTALLATION_SIGNED = new Set(['releaseCurrent', 'installationDownloadGrant']);
// Cookies relayed between the browser and the control plane. The two sign-in
// cookies (Google / GitHub) must survive the provider's cross-site redirect
// back, so they are Lax; they are never readable by page scripts.
const CONTROL_COOKIES = new Set(['syc_session', 'syc_csrf', 'syc_oauth', 'syc_oauth_ticket']);
const LAX_COOKIES = new Set(['syc_oauth', 'syc_oauth_ticket']);
const RESOURCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class ControlPlaneClientError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ControlPlaneClientError';
    this.code = code;
  }
}

function controlOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('valid control-plane URL is required'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError('control-plane URL must be a credential-free HTTPS origin');
  }
  return url.origin;
}

// The control plane rebuilds this exact string; keep the two in step.
export function installationSigningMessage({ method, pathname, timestamp, nonce }) {
  return `SYC-AI installation request v1\n${method}\n${pathname}\n${timestamp}\n${nonce}`;
}

// The signer keeps the private key; the gateway only ever sees a signature.
function installationHeaders({ installationId, sign }, method, pathname, timestamp) {
  if (!installationId || typeof sign !== 'function') throw new ControlPlaneClientError('installation_identity_required');
  const nonce = randomBytes(18).toString('base64url');
  const signature = sign(installationSigningMessage({ method, pathname, timestamp, nonce }));
  if (!signature) throw new ControlPlaneClientError('installation_identity_required');
  return {
    'x-syc-installation': installationId,
    'x-syc-timestamp': String(timestamp),
    'x-syc-nonce': nonce,
    'x-syc-signature': signature,
  };
}

function safeHeader(value, maximum) {
  const text = String(value || '').trim();
  return text && text.length <= maximum && !/[\r\n]/.test(text) ? text : '';
}

function controlCookies(header = '') {
  const selected = new Map();
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim().toLowerCase();
    if (!CONTROL_COOKIES.has(name)) continue;
    if (selected.has(name)) throw new ControlPlaneClientError('ambiguous_control_cookie');
    const value = part.slice(separator + 1).trim();
    if (!value || value.length > 4096 || /[\s;,\x00-\x1f\x7f]/.test(value)) {
      throw new ControlPlaneClientError('invalid_control_cookie');
    }
    selected.set(name, value);
  }
  return [...selected].map(([name, value]) => `${name}=${value}`).join('; ');
}

function upstreamSetCookies(headers) {
  if (typeof headers?.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers?.get?.('set-cookie');
  return single ? [single] : [];
}

function hardenedCookies(headers) {
  const output = [];
  const seen = new Set();
  for (const raw of upstreamSetCookies(headers)) {
    const parts = String(raw).split(';').map((part) => part.trim());
    const first = parts[0];
    const separator = first.indexOf('=');
    if (separator < 1) continue;
    const name = first.slice(0, separator).trim().toLowerCase();
    if (!CONTROL_COOKIES.has(name) || seen.has(name)) continue;
    const value = first.slice(separator + 1).trim();
    const attributes = new Map(parts.slice(1).map((part) => {
      const split = part.indexOf('=');
      return split < 0
        ? [part.toLowerCase(), '']
        : [part.slice(0, split).trim().toLowerCase(), part.slice(split + 1).trim()];
    }));
    const deleting = value === '' && attributes.get('max-age') === '0';
    if ((!value && !deleting) || value.length > 4096 || /[\s;,\x00-\x1f\x7f]/.test(value)) continue;
    seen.add(name);
    const lax = LAX_COOKIES.has(name);
    let cookie = `${name}=${value}; Path=/; ${name === 'syc_csrf' ? '' : 'HttpOnly; '}Secure; SameSite=${lax ? 'Lax' : 'Strict'}`;
    if (deleting) cookie += '; Max-Age=0';
    else if (lax) {
      const maxAge = Number(attributes.get('max-age'));
      if (!(Number.isInteger(maxAge) && maxAge > 0 && maxAge <= 3600)) continue;
      cookie += `; Max-Age=${maxAge}`;
    } else if (attributes.has('expires')) {
      const expiry = Date.parse(attributes.get('expires'));
      if (Number.isFinite(expiry)) cookie += `; Expires=${new Date(expiry).toUTCString()}`;
    }
    output.push(cookie);
  }
  return output;
}

async function boundedBytes(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    throw new ControlPlaneClientError('control_response_too_large');
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ControlPlaneClientError('control_response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, length);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_JSON_BYTES) throw new ControlPlaneClientError('control_response_too_large');
  return bytes;
}

function publicFailure(status, parsed) {
  if (status >= 500 || status < 400) return 'control_unavailable';
  const code = typeof parsed?.error === 'string' ? parsed.error : '';
  return /^[a-z][a-z0-9_]{1,63}$/.test(code) ? code : 'control_request_failed';
}

export function createControlPlaneClient({ baseUrl, fetchImpl = fetch, timeoutMs = 10_000, now = Date.now } = {}) {
  const origin = controlOrigin(baseUrl);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new TypeError('valid control-plane timeout is required');
  }

  return Object.freeze({
    async call(operation, {
      body,
      cookieHeader = '',
      csrfToken = '',
      clientAddress = '',
      userAgent = '',
      resourceId = '',
      installation = null,
    } = {}) {
      const route = OPERATIONS[operation];
      if (!route) throw new ControlPlaneClientError('unsupported_control_operation');
      const [method, routePath] = route;
      let pathname = routePath;
      if (routePath === 'ticket' || routePath === 'ticket-reply') {
        if (!RESOURCE_ID.test(String(resourceId))) throw new ControlPlaneClientError('invalid_control_resource');
        pathname = `/api/user/tickets/${resourceId}${routePath === 'ticket-reply' ? '/replies' : ''}`;
      }
      const headers = { accept: 'application/json' };
      const cookies = controlCookies(cookieHeader);
      if (cookies) headers.cookie = cookies;
      const csrf = safeHeader(csrfToken, 256);
      if (csrf) headers['x-syc-csrf'] = csrf;
      if (clientAddress) {
        if (!isIP(clientAddress)) throw new ControlPlaneClientError('invalid_client_address');
        headers['x-forwarded-for'] = clientAddress;
      }
      const agent = safeHeader(userAgent, 512);
      if (agent) headers['user-agent'] = agent;
      if (INSTALLATION_SIGNED.has(operation)) {
        // A signed request carries its own proof; a borrowed browser cookie
        // must never ride along with it.
        delete headers.cookie;
        delete headers['x-syc-csrf'];
        Object.assign(headers, installationHeaders(installation || {}, method, pathname, now()));
      }

      let encoded;
      if (method === 'POST') {
        headers.origin = origin;
        headers['content-type'] = 'application/json';
        encoded = JSON.stringify(body ?? {});
        if (Buffer.byteLength(encoded) > MAX_JSON_BYTES) {
          throw new ControlPlaneClientError('control_request_too_large');
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${origin}${pathname}`, {
          method,
          headers,
          body: encoded,
          redirect: 'error',
          signal: controller.signal,
        });
        const bytes = await boundedBytes(response);
        let parsed;
        try { parsed = JSON.parse(bytes.toString('utf8')); }
        catch { throw new ControlPlaneClientError('control_invalid_response'); }
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new ControlPlaneClientError('control_invalid_response');
        }
        const setCookies = hardenedCookies(response.headers);
        if (response.status < 200 || response.status >= 300) {
          return { status: response.status, body: { error: publicFailure(response.status, parsed) }, setCookies };
        }
        return { status: response.status, body: parsed, setCookies };
      } catch (error) {
        if (error instanceof ControlPlaneClientError) throw error;
        if (controller.signal.aborted) throw new ControlPlaneClientError('control_timeout');
        throw new ControlPlaneClientError('control_unavailable');
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
