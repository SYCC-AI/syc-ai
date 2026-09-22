import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createInstallationActivation } from '../installation-activation.mjs';
import { createOnboardingServer } from '../onboarding-server.mjs';

function entitlement(privateKey, installationId, issuedAtMs, ttlSeconds, jti) {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'SYC-AI-ENT', kid: 'launch-2026-01' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: 'syc-ai-control', aud: 'syc-ai-client', jti, sub: installationId, userId: 'user-1', planId: 'main',
    features: { launch_status: 'enabled' },
    iat: Math.floor(issuedAtMs / 1000), exp: Math.floor(issuedAtMs / 1000) + ttlSeconds,
  })).toString('base64url');
  const input = `${header}.${claims}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`;
}

async function fixture({ leaseIssuedAt, ttlSeconds, now, client = null }) {
  const directory = await mkdtemp(join(tmpdir(), 'syc-ai-renewal-'));
  const signing = generateKeyPairSync('ed25519');
  const issued = [];
  const controlClient = {
    async call(operation, options) {
      if (operation === 'session') return { status: 200, body: { data: { user: { username: 'owner' } } } };
      if (operation === 'entitlementIssue') {
        issued.push(options);
        return { status: 200, body: { data: {
          token: entitlement(signing.privateKey, 'install-1', now(), 6 * 3600, `lease-${issued.length + 1}`),
          tokenId: `lease-${issued.length + 1}`, expiresAt: new Date(now() + 6 * 3600_000).toISOString(),
        } } };
      }
      throw new Error(`unexpected operation: ${operation}`);
    },
  };
  await writeFile(join(directory, 'entitlement.json'), JSON.stringify({
    installationId: 'install-1', tokenId: 'lease-1',
    token: entitlement(signing.privateKey, 'install-1', leaseIssuedAt, ttlSeconds, 'lease-1'),
  }), { mode: 0o600 });
  const effective = client || controlClient;
  const activation = createInstallationActivation({
    dataDirectory: directory, controlClient: effective, entitlementPublicKey: signing.publicKey, now,
  });
  const onboarding = createOnboardingServer({ controlClient: effective, activation, productOrigin: 'https://panel.example', now });
  return { directory, activation, onboarding, issued };
}

test('an expired lease is renewed with the signed-in owner session instead of locking the panel', async () => {
  let clock = Date.parse('2026-09-22T12:00:00Z');
  const now = () => clock;
  const { directory, onboarding, issued } = await fixture({ leaseIssuedAt: clock - 7 * 3600_000, ttlSeconds: 6 * 3600, now });

  const result = await onboarding.authorize({ cookieHeader: 'syc_session=abc; syc_csrf=tok-1', clientAddress: '203.0.113.9', userAgent: 'test' });

  assert.equal(result.authorized, true);
  assert.equal(result.restricted, undefined);
  assert.equal(result.access.mode, 'active');
  assert.equal(issued.length, 1);
  assert.equal(issued[0].cookieHeader, 'syc_session=abc; syc_csrf=tok-1');
  assert.equal(issued[0].csrfToken, 'tok-1', 'the double-submit header comes from the cookie the browser already holds');
  assert.equal(issued[0].body.installationId, 'install-1');
  const cached = JSON.parse(await readFile(join(directory, 'entitlement.json'), 'utf8'));
  assert.equal(cached.tokenId, 'lease-2');
});

test('a lease is renewed an hour before it expires and not on every request', async () => {
  let clock = Date.parse('2026-09-22T12:00:00Z');
  const now = () => clock;
  const { onboarding, issued } = await fixture({ leaseIssuedAt: clock - (5 * 3600_000 + 30 * 60_000), ttlSeconds: 6 * 3600, now });

  await onboarding.authorize({ cookieHeader: 'syc_session=abc' });
  await onboarding.authorize({ cookieHeader: 'syc_session=abc' });
  assert.equal(issued.length, 1, 'one renewal covers the next six hours');

  clock += 10 * 60_000;
  await onboarding.authorize({ cookieHeader: 'syc_session=abc' });
  assert.equal(issued.length, 1);
});

test('a fresh lease is left alone and a failed renewal waits a minute before trying again', async () => {
  let clock = Date.parse('2026-09-22T12:00:00Z');
  const now = () => clock;
  const failing = {
    calls: 0,
    async call(operation) {
      if (operation === 'session') return { status: 200, body: { data: { user: { username: 'owner' } } } };
      failing.calls += 1;
      throw Object.assign(new Error('down'), { code: 'control_unavailable' });
    },
  };
  const { onboarding, issued } = await fixture({ leaseIssuedAt: clock - 60_000, ttlSeconds: 6 * 3600, now, client: failing });

  const fresh = await onboarding.authorize({ cookieHeader: 'c' });
  assert.equal(fresh.access.mode, 'active');
  assert.equal(issued.length, 0);

  clock += 7 * 3600_000;
  const expired = await onboarding.authorize({ cookieHeader: 'c', allowRestricted: true });
  assert.equal(expired.restricted, true);
  assert.equal(expired.access.reason, 'entitlement_expired');
  await onboarding.authorize({ cookieHeader: 'c', allowRestricted: true });
  assert.equal(failing.calls, 1, 'a dark control plane is asked once per minute, not per request');
  clock += 61_000;
  await onboarding.authorize({ cookieHeader: 'c', allowRestricted: true });
  assert.equal(failing.calls, 2);
});
