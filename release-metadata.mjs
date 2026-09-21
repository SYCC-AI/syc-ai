import { verify } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export const canonicalReleaseBytes = (metadata) => Buffer.from(canonical(metadata));

export function verifyReleaseMetadata({ metadata, signature, publicKey, now = Date.now } = {}) {
  if (!metadata || metadata.schema !== 1 || !Number.isSafeInteger(metadata.sequence) || metadata.sequence < 1) throw new Error('invalid release metadata');
  if (!['optional', 'required', 'emergency'].includes(metadata.mode)) throw new Error('invalid release mode');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(metadata.version || '')) throw new Error('invalid release version');
  const expiry = Date.parse(metadata.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now()) throw new Error('release metadata expired');
  for (const asset of [...Object.values(metadata.assets || {}), ...Object.values(metadata.panels || {})]) {
    if (!/^[A-Za-z0-9._-]+$/.test(asset.file || '') || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) throw new Error('invalid release asset');
  }
  let valid = false;
  try { valid = verify(null, canonicalReleaseBytes(metadata), publicKey, Buffer.from(String(signature || ''), 'base64url')); } catch {}
  if (!valid) throw new Error('release signature invalid');
  return structuredClone(metadata);
}
