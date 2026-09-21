import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { canonicalReleaseBytes, verifyReleaseMetadata } from '../release-metadata.mjs';

test('accepts only signed current release metadata with pinned asset identity', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const metadata = {
    schema: 1, sequence: 7, channel: 'stable', version: '0.1.0-preview.2',
    issuedAt: '2026-09-20T18:10:00.000Z', expiresAt: '2026-09-21T18:10:00.000Z',
    minimumVersion: '0.1.0-preview.1', mode: 'required',
    assets: { core: { file: 'core.tar.zst', bytes: 123, sha256: 'a'.repeat(64) } },
  };
  const signature = sign(null, canonicalReleaseBytes(metadata), privateKey).toString('base64url');
  const verified = verifyReleaseMetadata({ metadata, signature, publicKey, now: () => Date.parse('2026-09-20T18:11:00Z') });
  assert.equal(verified.sequence, 7);
  assert.equal(verified.assets.core.file, 'core.tar.zst');
  // Pinned: expiry is checked before the signature, so a real clock drifting
  // past this fixture's expiry would hide what this assertion is about.
  assert.throws(() => verifyReleaseMetadata({
    metadata: { ...metadata, sequence: 8 }, signature, publicKey,
    now: () => Date.parse('2026-09-20T18:11:00Z'),
  }), /signature/);
  assert.throws(() => verifyReleaseMetadata({ metadata, signature, publicKey, now: () => Date.parse('2026-09-22T00:00:00Z') }), /expired/);
});

test('signed panel descriptors require a safe file, exact size and SHA-256', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const base = {
    schema: 1, sequence: 8, channel: 'stable', version: '0.5.0',
    issuedAt: '2026-09-20T18:10:00.000Z', expiresAt: '2026-09-21T18:10:00.000Z',
    minimumVersion: '0.5.0', mode: 'optional', assets: {},
  };
  for (const descriptor of [
    { file: '../panel.tar.zst', bytes: 123, sha256: 'a'.repeat(64) },
    { file: 'panel-claude.tar.zst', bytes: 0, sha256: 'a'.repeat(64) },
    { file: 'panel-claude.tar.zst', bytes: 123, sha256: 'not-a-hash' },
  ]) {
    const metadata = { ...base, panels: { claude: descriptor } };
    const signature = sign(null, canonicalReleaseBytes(metadata), privateKey).toString('base64url');
    assert.throws(() => verifyReleaseMetadata({
      metadata, signature, publicKey, now: () => Date.parse('2026-09-20T18:11:00Z'),
    }), /asset/);
  }
});
