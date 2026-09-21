import {
  createPrivateKey, generateKeyPairSync, randomUUID, sign,
} from 'node:crypto';
import {
  chmod, mkdir, readFile, rename, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { entitlementAccess, verifyEntitlement } from './entitlement.mjs';

class InstallationActivationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'InstallationActivationError';
    this.code = code;
  }
}

async function readOptional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicPrivateWrite(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

function data(response, operation) {
  if (!response || response.status < 200 || response.status >= 300 || !response.body?.data) {
    throw new InstallationActivationError(response?.body?.error || `${operation}_failed`);
  }
  return response.body.data;
}

export function createInstallationActivation({
  dataDirectory,
  controlClient,
  entitlementPublicKey,
  now = Date.now,
  source = 'linux-panel',
  version = '0.1.0-preview.1',
} = {}) {
  if (!dataDirectory || !controlClient?.call || !entitlementPublicKey) {
    throw new TypeError('activation configuration is required');
  }
  const privatePath = join(dataDirectory, 'installation-private.pem');
  const publicPath = join(dataDirectory, 'installation-public.pem');
  const entitlementPath = join(dataDirectory, 'entitlement.json');
  let identityPromise;
  let activationPromise;

  async function identity() {
    if (!identityPromise) identityPromise = (async () => {
      await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
      await chmod(dataDirectory, 0o700);
      let privateKey = await readOptional(privatePath);
      let publicKey = await readOptional(publicPath);
      if (!privateKey || !publicKey) {
        const generated = generateKeyPairSync('ed25519');
        privateKey = generated.privateKey.export({ type: 'pkcs8', format: 'pem' });
        publicKey = generated.publicKey.export({ type: 'spki', format: 'pem' });
        await atomicPrivateWrite(privatePath, privateKey);
        await atomicPrivateWrite(publicPath, publicKey);
      } else {
        await chmod(privatePath, 0o600);
        await chmod(publicPath, 0o600);
      }
      let installationId = null;
      const cached = await readOptional(entitlementPath);
      if (cached) {
        try { installationId = JSON.parse(cached).installationId || null; } catch {}
      }
      return Object.freeze({ publicKey, installationId, privateKey });
    })();
    const value = await identityPromise;
    return { publicKey: value.publicKey, installationId: value.installationId };
  }

  async function activateInternal({ planId, catalog, ...requestContext } = {}) {
    if (!/^[a-z0-9._-]{2,32}$/.test(String(planId || ''))) {
      throw new InstallationActivationError('invalid_plan');
    }
    if (catalog) {
      const selected = catalog.plans?.find((plan) => plan.id === planId);
      if (!selected?.available) throw new InstallationActivationError('plan_unavailable');
    }
    await identity();
    const local = await identityPromise;
    const challenge = data(await controlClient.call('installationChallenge', {
      ...requestContext, body: { publicKey: local.publicKey, source, version },
    }), 'installation_challenge');
    if (!challenge.installationId || !challenge.challengeId || !challenge.nonce || !challenge.signingMessage) {
      throw new InstallationActivationError('invalid_installation_challenge');
    }
    const signature = sign(
      null,
      Buffer.from(challenge.signingMessage),
      createPrivateKey(local.privateKey),
    ).toString('base64url');
    const completed = data(await controlClient.call('installationComplete', {
      ...requestContext,
      body: { challengeId: challenge.challengeId, nonce: challenge.nonce, signature },
    }), 'installation_proof');
    if (!completed.verified || completed.installationId !== challenge.installationId) {
      throw new InstallationActivationError('invalid_installation_proof');
    }
    const activated = data(await controlClient.call('installationActivate', {
      ...requestContext, body: { installationId: challenge.installationId, planId },
    }), 'installation_activation');
    if (activated.installationId !== challenge.installationId || activated.planId !== planId) {
      throw new InstallationActivationError('invalid_installation_activation');
    }
    const issued = data(await controlClient.call('entitlementIssue', {
      ...requestContext, body: { installationId: challenge.installationId },
    }), 'entitlement_issue');
    const claims = verifyEntitlement(issued.token, {
      publicKey: entitlementPublicKey,
      installationId: challenge.installationId,
      now,
    });
    const cached = {
      installationId: challenge.installationId,
      token: issued.token,
      tokenId: issued.tokenId,
      expiresAt: issued.expiresAt,
    };
    await atomicPrivateWrite(entitlementPath, `${JSON.stringify(cached)}\n`);
    identityPromise = Promise.resolve(Object.freeze({ ...local, installationId: challenge.installationId }));
    return { ...cached, claims };
  }

  return Object.freeze({
    identity,
    // Everything the update channel needs to speak for this installation
    // without a user session, and nothing more: the private key stays here.
    async signer() {
      await identity();
      const local = await identityPromise;
      if (!local.installationId) throw new InstallationActivationError('installation_not_registered');
      return Object.freeze({
        installationId: local.installationId,
        sign: (message) => sign(null, Buffer.from(message), createPrivateKey(local.privateKey)).toString('base64url'),
      });
    },
    async access() {
      const raw = await readOptional(entitlementPath);
      if (!raw) return entitlementAccess('', { publicKey: entitlementPublicKey, installationId: 'missing', now });
      try {
        const cached = JSON.parse(raw);
        return entitlementAccess(cached.token, {
          publicKey: entitlementPublicKey,
          installationId: cached.installationId,
          now,
        });
      } catch {
        return entitlementAccess('', { publicKey: entitlementPublicKey, installationId: 'invalid', now });
      }
    },
    activate(options) {
      if (!activationPromise) {
        activationPromise = activateInternal(options).finally(() => { activationPromise = null; });
      }
      return activationPromise;
    },
  });
}
