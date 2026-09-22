const ROUTES = new Map([
  ['GET /api/onboarding/session', 'session'],
  ['POST /api/onboarding/otp', 'requestOtp'],
  ['POST /api/onboarding/signup', 'signup'],
  ['POST /api/onboarding/login', 'login'],
  ['POST /api/onboarding/recover-username', 'recoverUsername'],
  ['POST /api/onboarding/reset-password', 'resetPassword'],
  ['POST /api/onboarding/logout', 'logout'],
  ['GET /api/onboarding/export', 'accountExport'],
  ['GET /api/onboarding/announcements', 'announcements'],
  ['GET /api/onboarding/tickets', 'ticketList'],
  ['POST /api/onboarding/tickets', 'ticketCreate'],
]);
const TICKET_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const TICKET_THREAD = new RegExp(`^/api/onboarding/tickets/(${TICKET_ID})$`);
const TICKET_REPLY = new RegExp(`^/api/onboarding/tickets/(${TICKET_ID})/replies$`);

function resolveOperation(method, pathname) {
  const operation = ROUTES.get(`${method} ${pathname}`);
  if (operation) return { operation, resourceId: '' };
  const thread = method === 'GET' && TICKET_THREAD.exec(pathname);
  if (thread) return { operation: 'ticketThread', resourceId: thread[1] };
  const reply = method === 'POST' && TICKET_REPLY.exec(pathname);
  if (reply) return { operation: 'ticketReply', resourceId: reply[1] };
  return null;
}

function failure(status, error) {
  return { status, body: { error }, setCookies: [] };
}

function header(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function securityContext(request) {
  return {
    cookieHeader: header(request.headers, 'cookie'),
    csrfToken: header(request.headers, 'x-syc-csrf'),
    clientAddress: request.clientAddress || '',
    userAgent: header(request.headers, 'user-agent'),
  };
}

export function createOnboardingServer({ controlClient, activation, productOrigin, now = Date.now } = {}) {
  if (!controlClient?.call || !activation?.activate || !activation?.access) {
    throw new TypeError('onboarding dependencies are required');
  }
  let origin;
  try { origin = new URL(productOrigin).origin; } catch { throw new TypeError('valid product origin is required'); }

  async function dispatch(request = {}) {
    const method = String(request.method || '').toUpperCase();
    const pathname = String(request.pathname || '');
    if (!pathname.startsWith('/api/onboarding/')) return null;
    if (method === 'GET' && pathname === '/api/onboarding/bootstrap') {
      const context = securityContext(request);
      const [catalog, csrf] = await Promise.all([
        controlClient.call('catalog', context), controlClient.call('csrf', context),
      ]);
      if (catalog.status !== 200) return catalog;
      if (csrf.status !== 200) return csrf;
      return {
        status: 200,
        body: { data: { catalog: catalog.body.data, csrf: csrf.body.data } },
        setCookies: [...(catalog.setCookies || []), ...(csrf.setCookies || [])],
      };
    }
    const resolved = resolveOperation(method, pathname);
    const activating = method === 'POST' && pathname === '/api/onboarding/activate';
    if (!resolved && !activating) return null;
    if (method === 'POST' && header(request.headers, 'origin') !== origin) {
      return failure(403, 'origin_forbidden');
    }
    const context = securityContext(request);
    if (activating) {
      try {
        const result = await activation.activate({ ...context, planId: request.body?.planId });
        return {
          status: 200,
          body: { data: { installationId: result.installationId, planId: result.claims.planId, status: 'active' } },
          setCookies: [],
        };
      } catch (error) {
        return failure(409, error?.code || 'activation_failed');
      }
    }
    return controlClient.call(resolved.operation, {
      ...context,
      body: request.body || {},
      resourceId: resolved.resourceId,
    });
  }

  // Renew the lease an hour before it runs out, or as soon as it has, using
  // the signed-in owner's session. A failed attempt is not retried for a
  // minute so a dark control plane does not turn every page view into a call.
  const RENEW_AHEAD_MS = 60 * 60_000;
  let renewNotBefore = 0;
  async function renewed(context, access) {
    const nowMs = now();
    const expiring = access.mode === 'active' && Number.isInteger(access.claims?.exp)
      && access.claims.exp * 1000 - nowMs < RENEW_AHEAD_MS;
    const expired = access.mode !== 'active' && access.reason === 'entitlement_expired';
    if (!(expiring || expired) || nowMs < renewNotBefore || typeof activation.renew !== 'function') return access;
    renewNotBefore = nowMs + 60_000;
    try {
      await activation.renew(context);
      renewNotBefore = 0;
      return activation.access();
    } catch {
      return access;
    }
  }

  async function authorize({ cookieHeader = '', clientAddress = '', userAgent = '', allowRestricted = false } = {}) {
    const response = await controlClient.call('session', { cookieHeader, clientAddress, userAgent });
    if (response.status !== 200 || !response.body?.data?.user) {
      return { authorized: false, reason: 'login_required' };
    }
    const access = await renewed({ cookieHeader, clientAddress, userAgent }, await activation.access());
    if (access.mode !== 'active' && !allowRestricted) {
      return { authorized: false, reason: access.reason || 'entitlement_required', access };
    }
    return {
      authorized: true,
      ...(access.mode === 'active' ? {} : { restricted: true }),
      user: { ...response.body.data.user, accountMode: 'central' },
      access,
    };
  }

  return Object.freeze({ dispatch, authorize });
}
