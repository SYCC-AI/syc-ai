import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { entitlementAccess, verifyEntitlement } from '../entitlement.mjs';

function tokenFixture({ installationId = 'install-1', issuedAt = 1_795_000_000, expiresAt = 1_795_003_600 } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'SYC-AI-ENT', kid: 'launch-2026-01' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'syc-ai-control', aud: 'syc-ai-client', jti: 'token-1', sub: installationId,
    userId: 'user-1', planId: 'main', features: { launch_status: 'enabled' },
    iat: issuedAt, exp: expiresAt,
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return { token: `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`, publicKey };
}

test('client accepts only a valid entitlement bound to this installation', () => {
  const fixture = tokenFixture();
  const claims = verifyEntitlement(fixture.token, {
    publicKey: fixture.publicKey, installationId: 'install-1', now: () => 1_795_000_100_000,
  });
  assert.equal(claims.planId, 'main');
  assert.equal(claims.features.launch_status, 'enabled');
  assert.throws(() => verifyEntitlement(fixture.token, {
    publicKey: fixture.publicKey, installationId: 'copied-install', now: () => 1_795_000_100_000,
  }), /installation/i);
});

test('client rejects locally edited claims', () => {
  const fixture = tokenFixture();
  const parts = fixture.token.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  claims.planId = 'immortal';
  const edited = `${parts[0]}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${parts[2]}`;
  assert.throws(() => verifyEntitlement(edited, {
    publicKey: fixture.publicKey, installationId: 'install-1', now: () => 1_795_000_100_000,
  }), /signature/i);
});

test('expired or missing entitlement enters a narrow recovery mode', () => {
  const fixture = tokenFixture({ expiresAt: 1_795_000_010 });
  const expired = entitlementAccess(fixture.token, {
    publicKey: fixture.publicKey, installationId: 'install-1', now: () => 1_795_000_011_000,
  });
  assert.deepEqual(expired, {
    mode: 'restricted', reason: 'entitlement_expired',
    capabilities: ['account_recovery', 'support', 'data_export'],
  });
  assert.deepEqual(entitlementAccess('', {
    publicKey: fixture.publicKey, installationId: 'install-1', now: () => 1_795_000_011_000,
  }), {
    mode: 'restricted', reason: 'invalid_entitlement',
    capabilities: ['account_recovery', 'support', 'data_export'],
  });
});
