// Connects to the configured SYC-AI management plane so the owner can see
// this installation, its remaining time, push it updates and messages, and
// answer its tickets. It runs ONLY when data/license.json exists — which the
// installer writes on the user's own server — so our own build never registers.
//
// It sends nothing sensitive: a random fingerprint, the hostname, the version,
// and which panels are installed. No account, key or user content ever leaves.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');
const LICENSE = join(DATA, 'license.json');
const STATEF = join(DATA, 'edge-install.json');   // our identity (installId+token)
const CACHEF = join(DATA, 'edge-state.json');      // last server reply, for the UI
const HEARTBEAT_MS = 10 * 60 * 1000;

const readJson = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { const t = `${f}.tmp`; writeFileSync(t, JSON.stringify(v, null, 2), { mode: 0o600 }); renameSync(t, f); };

function version() { return readJson(join(ROOT, 'installer', 'panels.json'), {})?.version || '0'; }
function installedPanels() {
  const set = new Set();
  try { for (const l of readFileSync(join(DATA, 'installed-panels'), 'utf8').split('\n')) if (l.trim()) set.add(l.trim()); } catch {}
  return [...set];
}

async function post(server, path, bodyObj, token) {
  const r = await fetch(`${server}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Install-Token': token } : {}) },
    body: JSON.stringify(bodyObj),
    signal: AbortSignal.timeout(20000),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function register(lic) {
  const fp = readJson(STATEF)?.fingerprint || randomBytes(16).toString('hex');
  const { status, body } = await post(lic.server, '/api/edge/register', {
    fingerprint: fp, hostname: hostname(), flavor: lic.flavor || 'core',
    version: version(), source: lic.source || 'direct', user: lic.user || {},
  });
  if (status === 200 && body.installId) { writeJson(STATEF, { fingerprint: fp, installId: body.installId, token: body.token }); return readJson(STATEF); }
  return null;
}

async function beat(lic, id) {
  try {
    const { status, body } = await post(lic.server, '/api/edge/heartbeat',
      { installId: id.installId, version: version(), panels: installedPanels() }, id.token);
    if (status === 401) { // re-register once if the server forgot us
      const fresh = await register(lic); if (fresh) return beat(lic, fresh);
      return;
    }
    if (status === 200) writeJson(CACHEF, { ...body, at: Date.now() });
  } catch { /* offline; try again next tick */ }
}

export function startEdge() {
  const lic = readJson(LICENSE);
  if (!lic || !lic.server) return; // not an installed copy — do nothing
  (async () => {
    let id = readJson(STATEF);
    if (!id?.installId) id = await register(lic);
    if (!id?.installId) { setTimeout(startEdge, 60000); return; } // retry registration later
    await beat(lic, id);
    setInterval(() => beat(lic, id), HEARTBEAT_MS);
  })();
}
