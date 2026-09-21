import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { canonicalReleaseBytes } from '../release-metadata.mjs';
import { selectPanelRelease } from '../panel-release.mjs';

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const archive = Buffer.from('signed panel archive');
  const metadata = {
    schema: 1, sequence: 12, channel: 'stable', version: '0.5.0',
    issuedAt: '2026-09-21T00:00:00.000Z', expiresAt: '2099-09-22T00:00:00.000Z',
    minimumVersion: '0.5.0', mode: 'optional', assets: {},
    panels: { claude: {
      file: 'panel-claude.tar.zst', bytes: archive.length,
      sha256: createHash('sha256').update(archive).digest('hex'),
    } },
  };
  const signature = sign(null, canonicalReleaseBytes(metadata), privateKey).toString('base64url');
  return { archive, metadata, signature, publicKey };
}

test('selects a panel only from current authentic release metadata', () => {
  const f = fixture();
  const selected = selectPanelRelease({
    metadata: f.metadata, signature: f.signature, publicKey: f.publicKey,
    panelId: 'claude', priorSequence: 11,
  });
  assert.equal(selected.sequence, 12);
  assert.equal(selected.version, '0.5.0');
  assert.deepEqual(selected.descriptor, f.metadata.panels.claude);
  assert.throws(() => selectPanelRelease({
    metadata: { ...f.metadata, sequence: 13 }, signature: f.signature,
    publicKey: f.publicKey, panelId: 'claude', priorSequence: 11,
  }), /signature/);
  assert.throws(() => selectPanelRelease({
    metadata: f.metadata, signature: f.signature, publicKey: f.publicKey,
    panelId: 'codex', priorSequence: 11,
  }), /unavailable/);
  assert.throws(() => selectPanelRelease({
    metadata: f.metadata, signature: f.signature, publicKey: f.publicKey,
    panelId: 'claude', priorSequence: 13,
  }), /older/);
});

test('rejects panel bytes that differ in size or SHA-256', () => {
  const f = fixture();
  const selected = selectPanelRelease({
    metadata: f.metadata, signature: f.signature, publicKey: f.publicKey,
    panelId: 'claude', priorSequence: 12,
  });
  assert.equal(selected.verifyArchive(f.archive), undefined);
  assert.throws(() => selected.verifyArchive(Buffer.from('truncated')), /integrity/);
  const sameSize = Buffer.from(f.archive);
  sameSize[0] ^= 1;
  assert.throws(() => selected.verifyArchive(sameSize), /integrity/);
});
