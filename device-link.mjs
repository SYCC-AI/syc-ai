// Phone connection for this panel, self-contained: the panel is the only server
// involved, so an installation on someone else's machine connects with their own
// phone and nothing leaves that machine.
//
// The phone app (SYC Claw) signs in with the panel's own username and password;
// on success the panel issues a long-lived device token, which is what every
// later call from the phone carries. The owner then sets, from inside the panel,
// what the panel's agents are allowed to do on that phone. Disconnecting the
// phone deletes the token, so the app loses access the moment the panel says so.
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OFFLINE_AFTER = 90 * 1000;
// What the panel's agents may be allowed to do on a connected phone. Everything
// is off until the owner turns it on, and the app enforces the same list.
export const CAPABILITIES = ['screen', 'tap', 'type', 'apps', 'notifications', 'files'];

const hash = (value) => createHash('sha256').update(String(value)).digest('hex');

export function createDeviceLink({ dataDir, appDir }) {
  const file = join(dataDir, 'devices.json');
  const empty = { device: null };

  const load = () => {
    if (!existsSync(file)) return { ...empty };
    try { return { ...empty, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { return { ...empty }; }
  };
  const save = (state) => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(tmp, file);
  };

  // The APK this panel hands out, described from the file on disk so the page
  // can never advertise a version or a size that is not what downloads.
  function appRelease() {
    const manifestPath = join(appDir, 'release.json');
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const name = String(manifest.file || '');
      if (!name || name.includes('/') || name.includes('\\')) throw new Error('invalid apk name');
      const bytes = statSync(join(appDir, name)).size;
      return { ...manifest, bytes, sizeMb: (bytes / 1_000_000).toFixed(2), available: true };
    } catch {
      return { available: false };
    }
  }

  const publicDevice = (device) => (device ? {
    id: device.id,
    name: device.name,
    model: device.model || '',
    androidVersion: device.androidVersion || '',
    owner: device.owner || '',
    accessibility: device.accessibility === true,
    connectedAt: device.connectedAt,
    lastSeenAt: device.lastSeenAt || null,
    online: Boolean(device.lastSeenAt && Date.now() - device.lastSeenAt < OFFLINE_AFTER),
    permissions: device.permissions || {},
  } : null);

  return {
    CAPABILITIES,

    status() {
      const state = load();
      return { app: appRelease(), device: publicDevice(state.device) };
    },

    // Called by the app once, after the person signed in with the panel's own
    // credentials (which server.mjs has already verified). A fresh sign-in from a
    // phone replaces whatever phone was connected before — one panel, one phone.
    enroll({ owner, name, model, androidVersion }) {
      const state = load();
      const token = randomBytes(32).toString('base64url');
      state.device = {
        id: randomBytes(8).toString('hex'),
        owner: String(owner || '').slice(0, 60),
        name: String(name || 'Phone').slice(0, 60),
        model: String(model || '').slice(0, 60),
        androidVersion: String(androidVersion || '').slice(0, 20),
        tokenHash: hash(token),
        accessibility: false,
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        permissions: Object.fromEntries(CAPABILITIES.map((key) => [key, false])),
      };
      save(state);
      return { status: 200, token, device: publicDevice(state.device) };
    },

    // Every call from the phone carries the token; a token that is not the
    // stored one means the phone was disconnected (or replaced) and must stop.
    authenticate(token) {
      const state = load();
      if (!state.device || !token) return null;
      if (hash(token) !== state.device.tokenHash) return null;
      return state;
    },

    // The app reports its liveness and whether the accessibility service is on,
    // and reads back the capabilities the owner has granted from the panel.
    heartbeat(token, report = {}) {
      const state = this.authenticate(token);
      if (!state) return { status: 401, error: 'This phone is no longer connected.' };
      state.device.lastSeenAt = Date.now();
      if (typeof report.accessibility === 'boolean') state.device.accessibility = report.accessibility;
      save(state);
      return { status: 200, device: publicDevice(state.device), permissions: state.device.permissions };
    },

    setPermissions(permissions) {
      const state = load();
      if (!state.device) return { status: 404, error: 'No phone is connected.' };
      for (const key of CAPABILITIES) {
        if (key in permissions) state.device.permissions[key] = Boolean(permissions[key]);
      }
      save(state);
      return { status: 200, device: publicDevice(state.device) };
    },

    revoke() {
      const state = load();
      if (!state.device) return { status: 404, error: 'No phone is connected.' };
      save({ ...empty });
      return { status: 200, ok: true };
    },

    appRelease,
  };
}
