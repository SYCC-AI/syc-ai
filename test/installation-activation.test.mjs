import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createInstallationActivation } from '../installation-activation.mjs';

function entitlement(privateKey, installationId, now) {
  const header = Buffer.from(JSON.stringify({
    alg: 'EdDSA', typ: 'SYC-AI-ENT', kid: 'launch-2026-01',
  })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: 'syc-ai-control', aud: 'syc-ai-client', jti: 'entitlement-1',
    sub: installationId, userId: 'user-1', planId: 'main',
    features: { launch_status: 'enabled' },
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600,
  })).toString('base64url');
  const input = `${header}.${claims}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`;
}

test('installation identity is generated once and private material stays mode 0600', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'syc-ai-client-identity-'));
  const calls = [];
  const activation = createInstallationActivation({
    dataDirectory: directory,
    controlClient: { call: async (...args) => { calls.push(args); } },
    entitlementPublicKey: generateKeyPairSync('ed25519').publicKey,
  });

  const first = await activation.identity();
  const second = await activation.identity();
  assert.equal(second.publicKey, first.publicKey);
  assert.equal(second.installationId, null);
  assert.match(first.publicKey, /^-----BEGIN PUBLIC KEY-----/);
  assert.equal((await stat(join(directory, 'installation-private.pem'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, 'installation-public.pem'))).mode & 0o777, 0o600);
  assert.equal(calls.length, 0);
  assert.match(await readFile(join(directory, 'installation-private.pem'), 'utf8'), /^-----BEGIN PRIVATE KEY-----/);
});

test('activation signs the challenge, resumes with one identity and caches only a verified entitlement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'syc-ai-client-activation-'));
  const now = Date.parse('2026-09-20T18:00:00Z');
  const signing = generateKeyPairSync('ed25519');
  const operations = [];
  let failOnce = true;
  let publicKey;
  const controlClient = {
    async call(operation, options) {
      operations.push({ operation, body: options.body });
      if (operation === 'installationChallenge') {
        publicKey = options.body.publicKey;
        return { status: 201, body: { data: {
          installationId: 'install-1', challengeId: 'challenge-1', nonce: 'nonce-1',
          signingMessage: 'SYC-AI installation proof v1\nchallenge-1\ninstall-1\nnonce-1',
        } } };
      }
      if (operation === 'installationComplete') {
        assert.equal(options.body.challengeId, 'challenge-1');
        assert.equal(options.body.nonce, 'nonce-1');
        assert.ok(options.body.signature);
        assert.doesNotMatch(JSON.stringify(options), /PRIVATE KEY/);
        return { status: 200, body: { data: { verified: true, installationId: 'install-1' } } };
      }
      if (operation === 'installationActivate' && failOnce) {
        failOnce = false;
        throw Object.assign(new Error('network unavailable'), { code: 'control_unavailable' });
      }
      if (operation === 'installationActivate') {
        return { status: 200, body: { data: { installationId: 'install-1', planId: 'main', status: 'active' } } };
      }
      if (operation === 'entitlementIssue') {
        return { status: 200, body: { data: {
          token: entitlement(signing.privateKey, 'install-1', now),
          tokenId: 'entitlement-1', expiresAt: '2026-09-20T19:00:00.000Z',
        } } };
      }
      throw new Error(`unexpected operation: ${operation}`);
    },
  };
  const activation = createInstallationActivation({
    dataDirectory: directory, controlClient,
    entitlementPublicKey: signing.publicKey, now: () => now,
  });

  await assert.rejects(activation.activate({ planId: 'main' }), { code: 'control_unavailable' });
  const result = await activation.activate({ planId: 'main' });

  assert.equal(result.installationId, 'install-1');
  assert.equal(result.claims.planId, 'main');
  assert.equal(operations.filter(({ operation }) => operation === 'installationChallenge').length, 2);
  assert.equal(operations[0].body.publicKey, publicKey);
  assert.equal(operations[3].body.publicKey, publicKey);
  const cached = JSON.parse(await readFile(join(directory, 'entitlement.json'), 'utf8'));
  assert.equal(cached.installationId, 'install-1');
  assert.equal(cached.tokenId, 'entitlement-1');
  assert.doesNotMatch(JSON.stringify(operations), /PRIVATE KEY/);
  assert.doesNotMatch(JSON.stringify(cached), /PRIVATE KEY/);
  assert.equal((await stat(join(directory, 'entitlement.json'))).mode & 0o777, 0o600);
  const access = await activation.access();
  assert.equal(access.mode, 'active');
  assert.equal(access.claims.sub, 'install-1');
});
