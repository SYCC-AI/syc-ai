import { applyUpdate } from './update-manager.mjs';
import { verifyReleaseMetadata } from './release-metadata.mjs';

// The repair path. This panel asks the control plane what release it should be
// on — at startup, every six hours, and whenever the owner presses the button —
// and moves itself there.
//
// `optional` is an offer: the panel reports it and waits for the button.
// `required` and `emergency` are not: the panel applies them by itself, and if
// it cannot, it goes into restricted mode with a banner rather than pretending
// it is current. Recovery, support and export stay reachable in that state;
// that is the whole reason forced updates exist.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const FORCED = new Set(['required', 'emergency']);

function failureCode(error) {
  const code = String(error?.code || error?.message || 'update_failed');
  return /^[a-z][a-z0-9_]{1,63}$/.test(code) ? code : 'update_failed';
}

export function createUpdateService({
  activation,
  controlClient,
  releasePublicKey,
  root,
  stateFile,
  asset = 'core',
  preserve,
  currentSequence = 0,
  downloadAsset,
  extract,
  healthCheck,
  intervalMs = CHECK_INTERVAL_MS,
  retryIntervalMs = RETRY_INTERVAL_MS,
  onApplied = null,
  now = Date.now,
  logger = console,
} = {}) {
  if (!activation?.signer || !controlClient?.call || !releasePublicKey) {
    throw new TypeError('update service configuration is required');
  }
  if (!root || !stateFile || !downloadAsset || !extract || !healthCheck) {
    throw new TypeError('update service installation paths are required');
  }

  let state = {
    checkedAt: null,
    installedSequence: Number(currentSequence) || 0,
    available: null,
    restricted: false,
    reason: null,
    lastError: null,
  };
  let running = null;
  let timer = null;

  const snapshot = () => ({ ...state, available: state.available ? { ...state.available } : null });

  async function fetchCurrent() {
    const signer = await activation.signer();
    const response = await controlClient.call('releaseCurrent', { installation: signer });
    if (response.status !== 200 || !response.body?.data) {
      const error = new Error(response.body?.error || 'control_unavailable');
      error.code = response.body?.error || 'control_unavailable';
      throw error;
    }
    return response.body.data;
  }

  async function checkOnce() {
    const offered = await fetchCurrent();
    state = { ...state, checkedAt: new Date(now()).toISOString(), lastError: null };
    if (!offered.available) {
      state = { ...state, available: null, restricted: false, reason: null };
      return snapshot();
    }
    // Trust nothing the control plane says about the release until the pinned
    // release key says the same thing.
    const release = verifyReleaseMetadata({
      metadata: offered.manifest, signature: offered.signature, publicKey: releasePublicKey, now,
    });
    const forced = FORCED.has(release.mode);
    const newer = release.sequence > state.installedSequence;
    state = {
      ...state,
      available: newer
        ? { sequence: release.sequence, version: release.version, mode: release.mode }
        : null,
      restricted: false,
      reason: null,
    };
    if (!newer || !forced) return snapshot();

    try {
      const applied = await applyUpdate({
        root,
        stateFile,
        metadata: offered.manifest,
        signature: offered.signature,
        publicKey: releasePublicKey,
        asset,
        preserve,
        download: downloadAsset,
        extract,
        healthCheck,
        now,
      });
      state = {
        ...state,
        installedSequence: applied.sequence,
        available: null,
        restricted: false,
        reason: null,
      };
      logger.log?.(`[update] applied ${applied.version} (sequence ${applied.sequence})`);
      // The new tree is in place but this process is still the old code; the
      // service manager brings the new one up.
      try { await onApplied?.(applied); } catch (error) { logger.error?.(`[update] restart hook failed: ${failureCode(error)}`); }
    } catch (error) {
      // applyUpdate already rolled the installation back; the panel is intact
      // but out of policy, so say so instead of hiding it.
      state = {
        ...state,
        restricted: true,
        reason: 'update_required',
        lastError: failureCode(error),
      };
      logger.error?.(`[update] required release ${release.version} could not be applied: ${failureCode(error)}`);
    }
    return snapshot();
  }

  function check() {
    if (!running) running = checkOnce().finally(() => { running = null; });
    return running;
  }

  return Object.freeze({
    status: snapshot,
    check,
    // Restricted mode is the panel's own answer, so a control plane that has
    // gone dark can never silently unlock a panel it already locked.
    restricted: () => state.restricted,
    start() {
      if (timer) return;
      const tick = async () => {
        let delay = intervalMs;
        try { await check(); }
        catch (error) {
          state = { ...state, lastError: failureCode(error) };
          delay = retryIntervalMs;
          logger.error?.(`[update] check failed: ${failureCode(error)}`);
        }
        timer = setTimeout(tick, delay);
        timer.unref?.();
      };
      timer = setTimeout(tick, 0);
      timer.unref?.();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  });
}
