import { createHash } from 'node:crypto';
import { verifyReleaseMetadata } from './release-metadata.mjs';

export function selectPanelRelease({
  metadata, signature, publicKey, panelId, priorSequence = 0, now = Date.now,
} = {}) {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(String(panelId || ''))) {
    throw new Error('panel unavailable');
  }
  const release = verifyReleaseMetadata({ metadata, signature, publicKey, now });
  const prior = Number(priorSequence || 0);
  if (!Number.isSafeInteger(prior) || prior < 0 || release.sequence < prior) {
    throw new Error('release is older than installed state');
  }
  const descriptor = release.panels?.[panelId];
  if (!descriptor) throw new Error('panel unavailable in signed release');
  return Object.freeze({
    sequence: release.sequence,
    version: release.version,
    descriptor,
    verifyArchive(value) {
      const archive = Buffer.from(value);
      const hash = createHash('sha256').update(archive).digest('hex');
      if (archive.length !== descriptor.bytes || hash !== descriptor.sha256) {
        throw new Error('panel archive integrity failed');
      }
    },
  });
}
