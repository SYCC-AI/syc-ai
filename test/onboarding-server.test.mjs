import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnboardingServer } from '../onboarding-server.mjs';

function fixture({ access = { mode: 'active', capabilities: { launch_status: 'enabled' } } } = {}) {
  const calls = [];
  const controlClient = { async call(operation, options) {
    calls.push({ operation, options });
    if (operation === 'catalog') return { status: 200, body: { data: { plans: [] } }, setCookies: [] };
    if (operation === 'csrf') return { status: 200, body: { data: { csrfToken: 'csrf-1' } }, setCookies: ['syc_csrf=csrf-1'] };
    if (operation === 'session') return { status: 200, body: { data: { user: { username: 'owner' } } }, setCookies: [] };
    return { status: 200, body: { data: { ok: true } }, setCookies: ['syc_session=session-1'] };
  } };
  const activation = {
    async activate(options) { calls.push({ operation: 'localActivate', options }); return { installationId: 'install-1', claims: { planId: 'main' } }; },
    async access() { return access; },
  };
  return { calls, router: createOnboardingServer({ controlClient, activation, productOrigin: 'https://panel.example' }) };
}

test('onboarding server exposes exact same-origin routes and relays only named operations', async () => {
  const { router, calls } = fixture();
  const bootstrap = await router.dispatch({ method: 'GET', pathname: '/api/onboarding/bootstrap', headers: {} });
  assert.equal(bootstrap.status, 200);
  assert.deepEqual(calls.map(({ operation }) => operation), ['catalog', 'csrf']);
  assert.deepEqual(bootstrap.setCookies, ['syc_csrf=csrf-1']);
  assert.equal(await router.dispatch({ method: 'GET', pathname: '/api/onboarding/unknown', headers: {} }), null);

  const rejected = await router.dispatch({
    method: 'POST', pathname: '/api/onboarding/login',
    headers: { origin: 'https://evil.example', cookie: 'syc_csrf=csrf-1' },
    body: { username: 'owner', password: 'secret' },
  });
  assert.deepEqual(rejected, { status: 403, body: { error: 'origin_forbidden' }, setCookies: [] });
});

test('account export is relayed through one exact authenticated route', async () => {
  const { router, calls } = fixture();
  const response = await router.dispatch({
    method: 'GET', pathname: '/api/onboarding/export',
    headers: { cookie: 'syc_session=session-1' }, clientAddress: '198.51.100.10',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(({ operation }) => operation), ['accountExport']);
  assert.equal(await router.dispatch({
    method: 'POST', pathname: '/api/onboarding/export', headers: { origin: 'https://panel.example' },
  }), null);
});

test('login and activation pass security context without exposing installation private material', async () => {
  const { router, calls } = fixture();
  const headers = {
    origin: 'https://panel.example', cookie: 'syc_csrf=csrf-1; syc_session=session-1',
    'x-syc-csrf': 'csrf-1', 'user-agent': 'browser',
  };
  const login = await router.dispatch({
    method: 'POST', pathname: '/api/onboarding/login', headers,
    body: { username: 'owner', password: 'secret' }, clientAddress: '198.51.100.10',
  });
  assert.equal(login.status, 200);
  assert.deepEqual(login.setCookies, ['syc_session=session-1']);
  const active = await router.dispatch({
    method: 'POST', pathname: '/api/onboarding/activate', headers,
    body: { planId: 'main' }, clientAddress: '198.51.100.10',
  });
  assert.equal(active.status, 200);
  assert.equal(active.body.data.installationId, 'install-1');
  assert.doesNotMatch(JSON.stringify(calls), /PRIVATE KEY/);
});

test('protected access requires both a valid control session and active local entitlement', async () => {
  const { router } = fixture();
  assert.deepEqual(await router.authorize({ cookieHeader: 'syc_session=session-1' }), {
    authorized: true,
    user: { username: 'owner', accountMode: 'central' },
    access: { mode: 'active', capabilities: { launch_status: 'enabled' } },
  });
});

test('account support routes list, create, read and reply through named control operations', async () => {
  const { router, calls } = fixture();
  const ticketId = '123e4567-e89b-42d3-a456-426614174000';
  const headers = {
    origin: 'https://panel.example', cookie: 'syc_session=session-1; syc_csrf=csrf-1',
    'x-syc-csrf': 'csrf-1',
  };

  await router.dispatch({ method: 'GET', pathname: '/api/onboarding/tickets', headers });
  await router.dispatch({
    method: 'POST', pathname: '/api/onboarding/tickets', headers,
    body: { subject: 'Update support', category: 'technical', severity: 'high', body: 'Update failed.' },
  });
  await router.dispatch({ method: 'GET', pathname: `/api/onboarding/tickets/${ticketId}`, headers });
  await router.dispatch({
    method: 'POST', pathname: `/api/onboarding/tickets/${ticketId}/replies`, headers,
    body: { body: 'Additional details.' },
  });

  assert.deepEqual(calls.map(({ operation, options }) => [operation, options.resourceId || null]), [
    ['ticketList', null],
    ['ticketCreate', null],
    ['ticketThread', ticketId],
    ['ticketReply', ticketId],
  ]);
  assert.equal(await router.dispatch({
    method: 'GET', pathname: '/api/onboarding/tickets/not-a-ticket', headers,
  }), null);
});

test('restricted entitlement keeps the authenticated account available only when explicitly allowed', async () => {
  const { router } = fixture({ access: { mode: 'restricted', reason: 'entitlement_expired', capabilities: { support: 'enabled' } } });
  assert.deepEqual(await router.authorize({ cookieHeader: 'syc_session=session-1' }), {
    authorized: false,
    reason: 'entitlement_expired',
    access: { mode: 'restricted', reason: 'entitlement_expired', capabilities: { support: 'enabled' } },
  });
  assert.deepEqual(await router.authorize({ cookieHeader: 'syc_session=session-1', allowRestricted: true }), {
    authorized: true,
    restricted: true,
    user: { username: 'owner', accountMode: 'central' },
    access: { mode: 'restricted', reason: 'entitlement_expired', capabilities: { support: 'enabled' } },
  });
});

test('password change is relayed through one exact same-origin route', async () => {
  const { router, calls } = fixture();
  const response = await router.dispatch({
    method: 'POST', pathname: '/api/onboarding/password',
    headers: { origin: 'https://panel.example', cookie: 'syc_session=session-1; syc_csrf=csrf-1' },
    body: { currentPassword: 'old one', newPassword: 'A new passphrase 99!' }, clientAddress: '198.51.100.10',
  });
  assert.notEqual(response, null);
  assert.deepEqual(calls.map(({ operation }) => operation), ['passwordChange']);
  const foreign = await router.dispatch({
    method: 'POST', pathname: '/api/onboarding/password',
    headers: { origin: 'https://evil.example', cookie: 'syc_session=session-1; syc_csrf=csrf-1' }, body: {},
  });
  assert.equal(foreign.status, 403);
});

test('sign-in with a provider: start redirects, the callback bounces same-site, a new person finishes on the sign-in page', async () => {
  const calls = [];
  let callbackReply = { status: 200, body: { data: { result: 'signed_in' } }, setCookies: ['syc_session=s1'] };
  const controlClient = { async call(operation, options) {
    calls.push({ operation, options });
    if (operation === 'oauthStart') return { status: 200, body: { data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=x' } }, setCookies: ['syc_oauth=x'] };
    if (operation === 'oauthCallback') return callbackReply;
    if (operation === 'oauthTicket') return { status: 200, body: { data: { email: 'new@gmail.com' } }, setCookies: [] };
    return { status: 201, body: { data: { user: {} } }, setCookies: ['syc_session=s2'] };
  } };
  const activation = { async activate() {}, async access() { return { mode: 'active' }; } };
  const router = createOnboardingServer({ controlClient, activation, productOrigin: 'https://panel.example', hosted: true });

  const start = await router.dispatch({ method: 'GET', pathname: '/api/onboarding/oauth/google/start', headers: {} });
  assert.equal(start.redirect, 'https://accounts.google.com/o/oauth2/v2/auth?state=x');
  assert.deepEqual(start.setCookies, ['syc_oauth=x']);
  assert.deepEqual(calls.at(-1).options.body, { provider: 'google' });
  assert.equal(await router.dispatch({ method: 'GET', pathname: '/api/onboarding/oauth/evil/start', headers: {} }), null);

  const back = await router.dispatch({ method: 'GET', pathname: '/api/onboarding/oauth/google/callback', query: { code: 'c', state: 'x' }, headers: { cookie: 'syc_oauth=x' } });
  assert.deepEqual(calls.at(-1).options.body, { provider: 'google', code: 'c', state: 'x' });
  assert.equal(calls.at(-1).options.cookieHeader, 'syc_oauth=x');
  // A page, not a redirect: the session cookie is SameSite=Strict and a
  // redirect chain started on the provider's site would not send it.
  assert.match(back.html, /http-equiv="refresh" content="0;url=\/main"/);
  assert.deepEqual(back.setCookies, ['syc_session=s1']);

  callbackReply = { status: 200, body: { data: { result: 'signup' } }, setCookies: ['syc_oauth_ticket=t'] };
  const fresh = await router.dispatch({ method: 'GET', pathname: '/api/onboarding/oauth/github/callback', query: { code: 'c', state: 'x' }, headers: {} });
  assert.match(fresh.html, /url=\/login\?oauth=signup/);

  callbackReply = { status: 400, body: { error: 'gmail_required' }, setCookies: [] };
  const refused = await router.dispatch({ method: 'GET', pathname: '/api/onboarding/oauth/github/callback', query: { error: 'access_denied' }, headers: {} });
  assert.match(refused.html, /url=\/login\?oauth_error=access_denied/);
  const noGmail = await router.dispatch({ method: 'GET', pathname: '/api/onboarding/oauth/github/callback', query: { code: 'c', state: 'x' }, headers: {} });
  assert.match(noGmail.html, /url=\/login\?oauth_error=gmail_required/);

  const ticket = await router.dispatch({ method: 'GET', pathname: '/api/onboarding/oauth/ticket', headers: {} });
  assert.equal(ticket.body.data.email, 'new@gmail.com');
  const foreign = await router.dispatch({ method: 'POST', pathname: '/api/onboarding/oauth/complete', headers: { origin: 'https://evil.example' }, body: {} });
  assert.equal(foreign.status, 403);
  const done = await router.dispatch({ method: 'POST', pathname: '/api/onboarding/oauth/complete', headers: { origin: 'https://panel.example' }, body: { username: 'newbie', password: 'p' } });
  assert.equal(done.status, 201);
  assert.equal(calls.at(-1).operation, 'oauthComplete');
});
