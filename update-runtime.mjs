// The production halves of the update channel: fetching the archive bytes,
// unpacking them, and deciding whether the unpacked tree is actually alive.
// The policy itself lives in update-service.mjs and stays free of processes
// and sockets so it can be tested without either.
import { execFile, spawn } from 'node:child_process';
import { get } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const MAX_ASSET_BYTES = 512 * 1024 * 1024;
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 500;

// The artifact origin is the control plane itself; the route that serves these
// bytes is S3's half of this channel. The request is signed by the
// installation exactly like the release check, so it works with no session.
export function createAssetDownloader({ controlUrl, activation, fetchImpl = fetch, timeoutMs = 120_000 } = {}) {
  if (!controlUrl || !activation?.signer) throw new TypeError('asset downloader configuration is required');
  const origin = new URL(controlUrl).origin;

  return async function downloadAsset(descriptor) {
    if (!/^[A-Za-z0-9._-]+$/.test(descriptor?.file || '')) throw new Error('invalid release asset');
    if (!Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > MAX_ASSET_BYTES) {
      throw new Error('invalid release asset');
    }
    const signer = await activation.signer();
    const pathname = `/artifacts/${descriptor.file}`;
    const timestamp = String(Date.now());
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url');
    const signature = signer.sign(
      `SYC-AI installation request v1\nGET\n${pathname}\n${timestamp}\n${nonce}`,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${origin}${pathname}`, {
        method: 'GET',
        headers: {
          'x-syc-installation': signer.installationId,
          'x-syc-timestamp': timestamp,
          'x-syc-nonce': nonce,
          'x-syc-signature': signature,
        },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`release asset unavailable (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      // applyUpdate checks the hash as well; this only stops an absurd body
      // from being buffered in the first place.
      if (bytes.length !== descriptor.bytes) throw new Error('release asset integrity failed');
      return bytes;
    } finally { clearTimeout(timer); }
  };
}

export async function extractArchive(archive, stage) {
  const scratch = await mkdtemp(join(tmpdir(), 'syc-ai-release-'));
  const file = join(scratch, 'package.tar.zst');
  try {
    await writeFile(file, archive, { mode: 0o600 });
    await new Promise((resolve, reject) => {
      execFile('tar', ['--zstd', '-xf', file, '-C', stage], (error) => (error ? reject(error) : resolve()));
    });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

// A release is healthy when the tree it unpacked can actually serve a page.
// We start it on a loopback port of its own, ask it for the login screen, and
// shut it down again; nothing about the live panel is touched.
export function createHealthCheck({ port = 0, timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  return async function healthCheck({ root }) {
    const probePort = port || 20_000 + Math.floor(Math.random() * 20_000);
    const child = spawn(process.execPath, [join(root, 'server.mjs')], {
      cwd: root,
      env: { ...process.env, SYC_AI_PORT: String(probePort), FREE_WEB_PORT: String(probePort) },
      stdio: 'ignore',
      detached: false,
    });
    let exited = false;
    child.once('exit', () => { exited = true; });
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        if (exited) return false;
        const alive = await new Promise((resolve) => {
          const request = get({ host: '127.0.0.1', port: probePort, path: '/login' }, (response) => {
            response.resume();
            resolve(response.statusCode >= 200 && response.statusCode < 500);
          });
          request.on('error', () => resolve(false));
          request.setTimeout(2000, () => { request.destroy(); resolve(false); });
        });
        if (alive) return true;
        await delay(HEALTH_POLL_MS);
      }
      return false;
    } finally {
      if (!exited) child.kill('SIGKILL');
    }
  };
}
