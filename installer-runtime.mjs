// Installs one professional account from release metadata authenticated by the
// same pinned Ed25519 key used by the main installer.
import {
  createWriteStream, existsSync, mkdirSync, readFileSync,
  renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { createPublicKey } from 'node:crypto';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectPanelRelease } from './panel-release.mjs';

const DEFAULT_ROOT = dirname(fileURLToPath(import.meta.url));
const MAX_METADATA_BYTES = 128 * 1024;

const readJson = (file, fallback = null) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
};

function verifiedSource(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('release source is unavailable'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('release source is unavailable');
  }
  return url.href.replace(/\/$/, '');
}

async function boundedText(response) {
  if (!response?.ok) throw new Error('release metadata is unavailable');
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_METADATA_BYTES) throw new Error('release metadata is too large');
  const value = await response.text();
  if (Buffer.byteLength(value) > MAX_METADATA_BYTES) throw new Error('release metadata is too large');
  return value;
}

function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createInstallerRuntime({
  root = DEFAULT_ROOT, fetchImpl = fetch, spawnImpl = spawn, requestDownloadGrant,
} = {}) {
  const dataDirectory = join(root, 'data');
  const registryFile = join(root, 'installer', 'panels.json');
  const releaseFile = join(dataDirectory, 'release.json');
  const releaseKeyFile = join(dataDirectory, 'release-public.pem');
  const registry = () => readJson(registryFile, { panels: {} });
  const prefix = () => {
    try { return readFileSync(join(dataDirectory, 'install-prefix'), 'utf8').trim(); }
    catch { return 'syc-ai'; }
  };
  const isInstalled = (id) => existsSync(join(root, 'apps', id, 'server.mjs'));
  // What each professional account was installed from, so a newer signed
  // archive can be offered as an update instead of only a first install.
  const panelStateFile = (id) => join(dataDirectory, 'panels', `${id}.json`);
  const panelState = (id) => readJson(panelStateFile(id), null);
  const writePanelState = (id, state) => {
    mkdirSync(join(dataDirectory, 'panels'), { recursive: true, mode: 0o700 });
    const temporary = `${panelStateFile(id)}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    renameSync(temporary, panelStateFile(id));
  };

  // The signed manifest is public and small; fetching it once every few
  // minutes is how installed accounts learn that a newer archive exists.
  const MANIFEST_CACHE_MS = 10 * 60_000;
  let manifestCache = { at: 0, value: null };
  async function currentManifest() {
    if (Date.now() - manifestCache.at < MANIFEST_CACHE_MS) return manifestCache.value;
    const configuration = readJson(releaseFile);
    let value = null;
    try {
      const source = verifiedSource(configuration?.source);
      const [metadataText, signature] = await Promise.all([
        fetchImpl(`${source}/manifest.json`, { signal: AbortSignal.timeout(20_000) }).then(boundedText),
        fetchImpl(`${source}/manifest.sig`, { signal: AbortSignal.timeout(20_000) }).then(boundedText),
      ]);
      value = { metadata: JSON.parse(metadataText), signature: signature.trim() };
    } catch { value = null; }
    manifestCache = { at: Date.now(), value };
    return value;
  }

  function offeredUpdate(id, manifest) {
    const state = panelState(id);
    if (!manifest || !state?.sha256) return null;
    try {
      const selected = selectPanelRelease({
        metadata: manifest.metadata, signature: manifest.signature,
        publicKey: createPublicKey(readFileSync(releaseKeyFile, 'utf8')),
        panelId: id, priorSequence: state.sequence || 0,
      });
      if (selected.descriptor.sha256 === state.sha256) return null;
      return { sequence: selected.sequence, version: selected.version };
    } catch { return null; }
  }

  async function panelsStatus({ refresh = true } = {}) {
    const installable = Boolean(readJson(releaseFile)?.source && existsSync(releaseKeyFile));
    const manifest = installable && refresh ? await currentManifest() : null;
    const panels = Object.entries(registry().panels || {})
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, panel]) => {
        const installed = isInstalled(id);
        const update = installed ? offeredUpdate(id, manifest) : null;
        return {
          id, name: panel.name, order: panel.order, port: panel.port, installed,
          installedVersion: installed ? panelState(id)?.version || null : null,
          updateAvailable: Boolean(update), update,
        };
      });
    return { installable, panels };
  }

  async function installPanelStream(id, res, { update = false } = {}) {
    const emit = sse(res);
    const fail = (message) => { emit('error', { message }); res.end(); };
    let packageFile = '';
    try {
      const panel = registry().panels?.[id];
      if (!panel) return fail('unknown panel');
      if (isInstalled(id) && !update) { emit('done', { id, already: true }); res.end(); return; }
      if (update && !isInstalled(id)) return fail('panel is not installed');
      const configuration = readJson(releaseFile);
      const source = verifiedSource(configuration?.source);
      // The signed manifest is public — a machine needs it before it has an
      // identity. The archives it describes are not, so they may come from a
      // different, authenticated origin.
      const artifactSource = configuration?.artifactSource
        ? verifiedSource(configuration.artifactSource)
        : source;
      if (!existsSync(releaseKeyFile)) return fail('release verification key is unavailable');

      emit('step', { text: 'checking signed release', pct: 2 });
      const [metadataText, signature] = await Promise.all([
        fetchImpl(`${source}/manifest.json`, { signal: AbortSignal.timeout(20_000) }).then(boundedText),
        fetchImpl(`${source}/manifest.sig`, { signal: AbortSignal.timeout(20_000) }).then(boundedText),
      ]);
      let metadata;
      try { metadata = JSON.parse(metadataText); } catch { throw new Error('release metadata is invalid'); }
      const selected = selectPanelRelease({
        metadata,
        signature: signature.trim(),
        publicKey: createPublicKey(readFileSync(releaseKeyFile, 'utf8')),
        panelId: id,
        priorSequence: panelState(id)?.sequence || 0,
      });
      if (update && selected.descriptor.sha256 === panelState(id)?.sha256) {
        emit('done', { id, already: true }); res.end(); return;
      }

      mkdirSync(join(dataDirectory, 'tmp'), { recursive: true, mode: 0o700 });
      packageFile = join(dataDirectory, 'tmp', selected.descriptor.file);
      emit('step', {
        text: `downloading ${panel.name} (${(selected.descriptor.bytes / 1048576).toFixed(0)} MB)`, pct: 5,
      });
      const download = { signal: AbortSignal.timeout(15 * 60_000) };
      if (configuration.artifactAccess === 'grant') {
        if (typeof requestDownloadGrant !== 'function') throw new Error('private download grant is unavailable');
        const grant = await requestDownloadGrant({ panelId: id, releaseSequence: selected.sequence });
        const asset = grant?.asset || {};
        if (!/^[A-Za-z0-9_-]{43}$/.test(String(grant?.token || '')) || asset.panelId !== id ||
            asset.releaseSequence !== selected.sequence || asset.file !== selected.descriptor.file ||
            asset.bytes !== selected.descriptor.bytes || asset.sha256 !== selected.descriptor.sha256) {
          throw new Error('download grant does not match signed release');
        }
        // The control plane binds the grant to an installation and checks the
        // pair on redemption, so both halves travel together.
        if (!/^[0-9a-f-]{36}$/.test(String(grant.installationId || ''))) {
          throw new Error('download grant does not match signed release');
        }
        download.headers = {
          authorization: `Bearer ${grant.token}`,
          'x-syc-installation': grant.installationId,
        };
        download.redirect = 'error';
      }
      const response = await fetchImpl(`${artifactSource}/${selected.descriptor.file}`, download);
      if (!response.ok || !response.body) throw new Error('panel download failed');
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared !== selected.descriptor.bytes) {
        throw new Error('panel archive integrity failed');
      }
      let received = 0;
      let lastPercent = 5;
      const file = createWriteStream(packageFile, { mode: 0o600 });
      const reader = Readable.fromWeb(response.body);
      reader.on('data', (chunk) => {
        received += chunk.length;
        const percent = Math.min(70, 5 + Math.round((received / selected.descriptor.bytes) * 60));
        if (percent >= lastPercent + 2) {
          lastPercent = percent;
          emit('step', { text: 'downloading', pct: percent });
        }
      });
      await new Promise((resolve, reject) => {
        reader.pipe(file); file.on('finish', resolve); file.on('error', reject); reader.on('error', reject);
      });
      emit('step', { text: 'verifying signed package', pct: 74 });
      selected.verifyArchive(readFileSync(packageFile));

      emit('step', { text: 'installing', pct: 80 });
      const child = spawnImpl('/usr/bin/env', [
        'bash', join(root, 'installer', 'panel-install.sh'), id, packageFile, String(panel.port),
      ], { cwd: root, env: { ...process.env, PATH: process.env.PATH } });
      let percent = 80;
      const onLine = (buffer) => {
        for (const line of buffer.toString().split('\n')) {
          const match = line.match(/^STEP (.+)/);
          if (match) { percent = Math.min(97, percent + 3); emit('step', { text: match[1], pct: percent }); }
        }
      };
      child.stdout.on('data', onLine);
      child.stderr.on('data', onLine);
      const code = await new Promise((resolve, reject) => {
        child.once('close', resolve);
        child.once('error', reject);
      });
      if (code !== 0) throw new Error(`installer exited with code ${code}`);
      // Per-panel, never the core's release-state.json: that file is the
      // update channel's record of the *panel shell*, and a professional
      // account landing at a later sequence must not make the shell look
      // updated when it was not.
      writePanelState(id, {
        sequence: selected.sequence, version: selected.version,
        sha256: selected.descriptor.sha256, installedAt: new Date().toISOString(),
      });
      manifestCache = { at: 0, value: null };
      emit('done', { id, pct: 100, updated: update });
      res.end();
    } catch (error) {
      fail(error?.message || 'panel installation failed');
    } finally {
      if (packageFile) rmSync(packageFile, { force: true });
    }
  }

  return Object.freeze({ panelsStatus, installPanelStream });
}

const defaultRuntime = createInstallerRuntime();
export const panelsStatus = (...args) => defaultRuntime.panelsStatus(...args);
export const installPanelStream = (...args) => defaultRuntime.installPanelStream(...args);
