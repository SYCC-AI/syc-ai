import { sign } from 'node:crypto';
import { canonicalReleaseBytes } from '../release-metadata.mjs';

export function createSignedRelease({
  privateKey, sequence, version, assets, issuedAt = new Date().toISOString(),
  expiresAt, minimumVersion = version, mode = 'optional', channel = 'stable', extra = {},
} = {}) {
  if (!privateKey) throw new TypeError('release signing key is required');
  const metadata = {
    ...extra, schema: 1, sequence, channel, version, issuedAt, expiresAt,
    minimumVersion, mode, assets,
  };
  const signature = sign(null, canonicalReleaseBytes(metadata), privateKey).toString('base64url');
  return { metadata, signature };
}
