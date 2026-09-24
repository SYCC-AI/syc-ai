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
  ['POST /api/onboarding/password', 'passwordChange'],
  ['GET /api/onboarding/oauth/ticket', 'oauthTicket'],
  ['POST /api/onboarding/oauth/complete', 'oauthComplete'],
]);
// Sign in with Google or GitHub. start and callback are top-level browser
// navigations (GET); the callback answers with a tiny same-origin page that
// moves on, because the session cookie is SameSite=Strict and a redirect
// chain that began on the provider's site would arrive without it.
const OAUTH_ROUTE = /^\/api\/onboarding\/oauth\/(google|github)\/(start|callback)$/;
const OAUTH_ERROR = /^[a-z_]{3,40}$/;
function bounce(target, setCookies = []) {
  const safe = String(target).replace(/[^A-Za-z0-9/?=&_.-]/g, '');
  return {
    status: 200,
    html: `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${safe}"><title>SYC-AI</title><a href="${safe}">Continue</a>`,
    setCookies,
  };
}

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

export function createOnboardingServer({ controlClient, activation, productOrigin, hosted = false, now = Date.now } = {}) {
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
    const oauthRoute = method === 'GET' && OAUTH_ROUTE.exec(pathname);
    if (oauthRoute) {
      const [, provider, step] = oauthRoute;
      const context = securityContext(request);
      if (step === 'start') {
        const result = await controlClient.call('oauthStart', { ...context, body: { provider } });
        const url = result.status === 200 ? String(result.body?.data?.url || '') : '';
        if (!url.startsWith('https://')) return bounce(`/login?oauth_error=${OAUTH_ERROR.test(result.body?.error || '') ? result.body.error : 'provider_unavailable'}`);
        return { status: 302, redirect: url, setCookies: result.setCookies || [] };
      }
      const query = request.query || {};
      // The person pressed "Cancel" at the provider, or it reported an error.
      if (query.error || !query.code) return bounce(`/login?oauth_error=${OAUTH_ERROR.test(String(query.error || '')) ? query.error : 'oauth_cancelled'}`);
      const result = await controlClient.call('oauthCallback', {
        ...context, body: { provider, code: String(query.code).slice(0, 512), state: String(query.state || '').slice(0, 256) },
      });
      if (result.status !== 200) {
        const code = String(result.body?.error || '');
        return bounce(`/login?oauth_error=${OAUTH_ERROR.test(code) ? code : 'oauth_failed'}`, result.setCookies || []);
      }
      return bounce(result.body?.data?.result === 'signup' ? '/login?oauth=signup' : '/main', result.setCookies || []);
    }
    const resolved = resolveOperation(method, pathname);
    const activating = method === 'POST' && pathname === '/api/onboarding/activate';
    if (!resolved && !activating) return null;
    if (method === 'POST' && header(request.headers, 'origin') !== origin) {
      return failure(403, 'origin_forbidden');
    }
    const context = securityContext(request);
    if (activating && hosted) {
      // Hosted panel: the plan belongs to the signed-in user, not to this server's installation.
      const result = await controlClient.call('planActivate', { ...context, body: { planId: request.body?.planId } });
      if (result.status !== 200) return result;
      return {
        status: 200,
        body: { data: { installationId: 'hosted', planId: result.body.data.planId, status: 'active', endsAt: result.body.data.endsAt } },
        setCookies: result.setCookies || [],
      };
    }
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
    // The control plane double-submits CSRF; on a page view nobody sent the
    // header, so the panel supplies the cookie's own value.
    const csrfToken = /(?:^|;\s*)syc_csrf=([^;]+)/.exec(context.cookieHeader || '')?.[1] || '';
    try {
      await activation.renew({ ...context, csrfToken });
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
    if (hosted) {
      const plan = response.body.data.user.plan || {};
      const access = plan.active
        ? { mode: 'active', planId: plan.planId, endsAt: plan.endsAt }
        : { mode: 'restricted', reason: 'plan_required' };
      if (access.mode !== 'active' && !allowRestricted) return { authorized: false, reason: 'plan_required', access };
      return {
        authorized: true,
        ...(access.mode === 'active' ? {} : { restricted: true }),
        user: { ...response.body.data.user, accountMode: 'central' },
        access,
      };
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
