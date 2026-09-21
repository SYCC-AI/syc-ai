import { verify as verifyBytes } from 'node:crypto';

const RESTRICTED_CAPABILITIES = Object.freeze(['account_recovery', 'support', 'data_export']);

class EntitlementError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'EntitlementError';
    this.code = code;
  }
}

function parse(value) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new EntitlementError('invalid_entitlement'); }
}

export function verifyEntitlement(token, { publicKey, installationId, now = Date.now } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !publicKey || !installationId) throw new EntitlementError('invalid_entitlement');
  const header = parse(parts[0]);
  const claims = parse(parts[1]);
  if (header.alg !== 'EdDSA' || header.typ !== 'SYC-AI-ENT' || !header.kid) {
    throw new EntitlementError('invalid_entitlement');
  }
  let signatureValid = false;
  try {
    signatureValid = verifyBytes(
      null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'),
    );
  } catch {}
  if (!signatureValid) throw new EntitlementError('invalid_signature', 'entitlement signature is invalid');
  if (claims.iss !== 'syc-ai-control' || claims.aud !== 'syc-ai-client' || !claims.jti) {
    throw new EntitlementError('invalid_entitlement');
  }
  if (claims.sub !== installationId) {
    throw new EntitlementError('wrong_installation', 'entitlement belongs to another installation');
  }
  const currentSeconds = Math.floor(now() / 1000);
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat > currentSeconds + 60) {
    throw new EntitlementError('invalid_entitlement');
  }
  if (claims.exp <= currentSeconds) throw new EntitlementError('entitlement_expired');
  if (!claims.planId || !claims.features || typeof claims.features !== 'object' || Array.isArray(claims.features)) {
    throw new EntitlementError('invalid_entitlement');
  }
  return claims;
}

export function entitlementAccess(token, options) {
  try {
    const claims = verifyEntitlement(token, options);
    return { mode: 'active', reason: null, capabilities: claims.features, claims };
  } catch (error) {
    return {
      mode: 'restricted',
      reason: error instanceof EntitlementError ? error.code : 'invalid_entitlement',
      capabilities: [...RESTRICTED_CAPABILITIES],
    };
  }
}
