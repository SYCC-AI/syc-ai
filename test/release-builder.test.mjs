import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { createSignedRelease } from '../installer/release-builder.mjs';
import { verifyReleaseMetadata } from '../release-metadata.mjs';

test('release builder emits metadata and detached signature accepted by the client verifier', () => {
  const keys = generateKeyPairSync('ed25519');
  const { metadata, signature } = createSignedRelease({
    privateKey: keys.privateKey, sequence: 9, version: '0.1.0-preview.2',
    issuedAt: '2026-09-20T18:00:00.000Z', expiresAt: '2026-09-21T18:00:00.000Z',
    assets: { core: { file: 'core.tar.zst', bytes: 10, sha256: 'b'.repeat(64) } },
  });
  assert.equal(verifyReleaseMetadata({
    metadata, signature, publicKey: keys.publicKey,
    now: () => Date.parse('2026-09-20T19:00:00Z'),
  }).sequence, 9);
});
