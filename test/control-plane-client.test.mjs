import assert from 'node:assert/strict';
import test from 'node:test';
import { createControlPlaneClient } from '../control-plane-client.mjs';

function response(status, value, setCookies = []) {
  const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  return {
    status,
    headers: { getSetCookie: () => setCookies },
    arrayBuffer: async () => bytes,
  };
}

function fixture(reply = response(200, { data: { ok: true } })) {
  const calls = [];
  const client = createControlPlaneClient({
    baseUrl: 'https://control.example',
    timeoutMs: 500,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return reply;
    },
  });
  return { client, calls };
}

test('named operations use only fixed HTTPS paths, methods and upstream origin', async () => {
  const expectations = [
    ['catalog', 'GET', '/api/public/catalog'],
    ['csrf', 'GET', '/api/public/csrf'],
    ['requestOtp', 'POST', '/api/public/otp/request'],
    ['signup', 'POST', '/api/public/signup'],
    ['login', 'POST', '/api/public/login'],
    ['recoverUsername', 'POST', '/api/public/recovery/username'],
    ['resetPassword', 'POST', '/api/public/recovery/password'],
    ['session', 'GET', '/api/user/session'],
    ['accountExport', 'GET', '/api/user/export'],
    ['logout', 'POST', '/api/user/logout'],
    ['installationChallenge', 'POST', '/api/user/installations/challenge'],
    ['installationComplete', 'POST', '/api/user/installations/complete'],
    ['installationActivate', 'POST', '/api/user/installations/activate'],
    ['entitlementIssue', 'POST', '/api/user/entitlements/issue'],
    ['ticketList', 'GET', '/api/user/tickets'],
    ['ticketCreate', 'POST', '/api/user/tickets'],
  ];
  for (const [operation, method, pathname] of expectations) {
    const { client, calls } = fixture();
    await client.call(operation, method === 'POST' ? { body: { marker: operation } } : {});
    assert.equal(calls[0].url, `https://control.example${pathname}`);
    assert.equal(calls[0].options.method, method);
    assert.equal(calls[0].options.redirect, 'error');
    if (method === 'POST') {
      assert.equal(calls[0].options.headers.origin, 'https://control.example');
      assert.equal(calls[0].options.headers['content-type'], 'application/json');
    }
  }

  const { client } = fixture();
  await assert.rejects(client.call('https://evil.example/steal'), { code: 'unsupported_control_operation' });
});

test('ticket resource operations accept only canonical UUID paths', async () => {
  const ticketId = '123e4567-e89b-42d3-a456-426614174000';
  for (const [operation, method, suffix] of [
    ['ticketThread', 'GET', ''],
    ['ticketReply', 'POST', '/replies'],
  ]) {
    const { client, calls } = fixture();
    await client.call(operation, { resourceId: ticketId, body: { body: 'Follow-up details.' } });
    assert.equal(calls[0].url, `https://control.example/api/user/tickets/${ticketId}${suffix}`);
    assert.equal(calls[0].options.method, method);
  }
  const { client, calls } = fixture();
  await assert.rejects(client.call('ticketThread', { resourceId: '../admin' }), {
    code: 'invalid_control_resource',
  });
  assert.equal(calls.length, 0);
});

test('gateway forwards only bounded control cookies and hardened returned cookies', async () => {
  const { client, calls } = fixture(response(200, { data: { user: { username: 'owner' } } }, [
    'syc_session=opaque-token; Domain=control.example; Path=/; HttpOnly; Expires=Sun, 20 Sep 2026 23:00:00 GMT',
    'syc_csrf=csrf-token; Domain=control.example; Path=/',
    'unrelated=drop-me; Path=/',
  ]));
  const result = await client.call('login', {
    body: { username: 'owner', password: 'not-logged' },
    cookieHeader: 'sycfree=legacy; syc_session=old-session; syc_csrf=old-csrf',
    csrfToken: 'old-csrf',
    clientAddress: '198.51.100.24',
    userAgent: 'SYC browser',
  });

  assert.equal(calls[0].options.headers.cookie, 'syc_session=old-session; syc_csrf=old-csrf');
  assert.equal(calls[0].options.headers['x-syc-csrf'], 'old-csrf');
  assert.equal(calls[0].options.headers['x-forwarded-for'], '198.51.100.24');
  assert.equal(calls[0].options.headers['user-agent'], 'SYC browser');
  assert.deepEqual(result.setCookies, [
    'syc_session=opaque-token; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=Sun, 20 Sep 2026 23:00:00 GMT',
    'syc_csrf=csrf-token; Path=/; Secure; SameSite=Strict',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /not-logged|legacy|unrelated/);
});

test('gateway relays only hardened control-cookie deletion directives', async () => {
  const { client } = fixture(response(200, { data: { loggedOut: true } }, [
    'syc_session=; Domain=control.example; Path=/private; Max-Age=0',
    'syc_csrf=; Path=/private; Max-Age=0',
  ]));
  const result = await client.call('logout');
  assert.deepEqual(result.setCookies, [
    'syc_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    'syc_csrf=; Path=/; Secure; SameSite=Strict; Max-Age=0',
  ]);
});

test('gateway rejects unsafe configuration, duplicate cookies and oversized bodies before fetch', async () => {
  assert.throws(() => createControlPlaneClient({ baseUrl: 'http://control.example', fetchImpl: async () => {} }));
  assert.throws(() => createControlPlaneClient({ baseUrl: 'https://user:pass@control.example', fetchImpl: async () => {} }));
  const { client, calls } = fixture();
  await assert.rejects(
    client.call('session', { cookieHeader: 'syc_session=one; SYC_SESSION=two' }),
    { code: 'ambiguous_control_cookie' },
  );
  await assert.rejects(
    client.call('signup', { body: { value: 'x'.repeat(65_536) } }),
    { code: 'control_request_too_large' },
  );
  assert.equal(calls.length, 0);
});

test('gateway bounds response size and sanitizes invalid or failed upstream responses', async () => {
  const tooLarge = fixture(response(200, 'x'.repeat(65_537))).client;
  await assert.rejects(tooLarge.call('catalog'), { code: 'control_response_too_large' });

  const invalid = fixture(response(200, 'not json with private upstream detail')).client;
  await assert.rejects(invalid.call('catalog'), { code: 'control_invalid_response' });

  const failed = fixture(response(503, { error: 'smtp password leaked by upstream' })).client;
  const result = await failed.call('catalog');
  assert.deepEqual(result, { status: 503, body: { error: 'control_unavailable' }, setCookies: [] });
});

test('gateway aborts a stalled upstream request with a stable timeout', async () => {
  let signal;
  const client = createControlPlaneClient({
    baseUrl: 'https://control.example',
    timeoutMs: 100,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    },
  });
  await assert.rejects(client.call('catalog'), { code: 'control_timeout' });
  assert.equal(signal.aborted, true);
});

test('gateway timeout also bounds a stalled response body', async () => {
  let signal;
  const client = createControlPlaneClient({
    baseUrl: 'https://control.example',
    timeoutMs: 100,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return {
        status: 200,
        headers: { getSetCookie: () => [] },
        body: {
          getReader() {
            return {
              read() {
                return new Promise((_resolve, reject) => {
                  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                });
              },
            };
          },
        },
      };
    },
  });
  await assert.rejects(client.call('catalog'), { code: 'control_timeout' });
  assert.equal(signal.aborted, true);
});
