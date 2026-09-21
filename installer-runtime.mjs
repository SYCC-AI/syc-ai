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
  const releaseStateFile = join(dataDirectory, 'release-state.json');
  const registry = () => readJson(registryFile, { panels: {} });
  const prefix = () => {
    try { return readFileSync(join(dataDirectory, 'install-prefix'), 'utf8').trim(); }
    catch { return 'syc-ai'; }
  };
  const isInstalled = (id) => existsSync(join(root, 'apps', id, 'server.mjs'));

  function panelsStatus() {
    const panels = Object.entries(registry().panels || {})
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, panel]) => ({
        id, name: panel.name, order: panel.order, port: panel.port, installed: isInstalled(id),
      }));
    return { installable: Boolean(readJson(releaseFile)?.source && existsSync(releaseKeyFile)), panels };
  }

  async function installPanelStream(id, res) {
    const emit = sse(res);
    const fail = (message) => { emit('error', { message }); res.end(); };
    let packageFile = '';
    try {
      const panel = registry().panels?.[id];
      if (!panel) return fail('unknown panel');
      if (isInstalled(id)) { emit('done', { id, already: true }); res.end(); return; }
      const configuration = readJson(releaseFile);
      const source = verifiedSource(configuration?.source);
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
        priorSequence: readJson(releaseStateFile, { sequence: 0 }).sequence,
      });

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
        download.headers = { authorization: `Bearer ${grant.token}` };
        download.redirect = 'error';
      }
      const response = await fetchImpl(`${source}/${selected.descriptor.file}`, download);
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
      const temporaryState = `${releaseStateFile}.tmp`;
      writeFileSync(temporaryState, `${JSON.stringify({
        sequence: selected.sequence, version: selected.version,
      })}\n`, { mode: 0o600 });
      renameSync(temporaryState, releaseStateFile);
      emit('done', { id, pct: 100 });
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
