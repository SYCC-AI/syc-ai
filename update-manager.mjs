import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { verifyReleaseMetadata } from './release-metadata.mjs';

async function readState(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return { sequence: 0 }; throw error; }
}

async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}

export async function applyUpdate({
  root, stateFile, metadata, signature, publicKey, asset,
  download, extract, healthCheck, now = Date.now,
  // Trees the release archive does not carry and must not take away. `data`
  // is the user's own state; `apps` and `runtime` are the professional
  // accounts installed into this root by the in-panel installer, which a core
  // release would otherwise silently uninstall.
  preserve = ['data'],
} = {}) {
  if (!root || !stateFile || !download || !extract || !healthCheck) throw new TypeError('update configuration is required');
  const release = verifyReleaseMetadata({ metadata, signature, publicKey, now });
  const priorState = await readState(stateFile);
  if (release.sequence <= Number(priorState.sequence || 0)) throw new Error('release sequence is not newer');
  const descriptor = release.assets?.[asset];
  if (!descriptor) throw new Error('release asset is unavailable');
  const archive = Buffer.from(await download(descriptor));
  if (archive.length !== descriptor.bytes || createHash('sha256').update(archive).digest('hex') !== descriptor.sha256) {
    throw new Error('release asset integrity failed');
  }
  const parent = dirname(root);
  const token = randomUUID();
  const stage = join(parent, `.syc-ai-stage-${token}`);
  const backup = join(parent, `.syc-ai-backup-${token}`);
  await mkdir(stage, { mode: 0o700 });
  let movedPrior = false;
  let activated = false;
  try {
    await extract(archive, stage);
    for (const name of preserve) {
      if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') throw new Error('invalid preserved path');
      try { await cp(join(root, name), join(stage, name), { recursive: true, force: true }); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    try { await rename(root, backup); movedPrior = true; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await rename(stage, root);
    activated = true;
    if (!await healthCheck({ root, release })) throw new Error('updated installation failed health check');
    await atomicJson(stateFile, { sequence: release.sequence, version: release.version, activatedAt: new Date(now()).toISOString() });
    if (movedPrior) await rm(backup, { recursive: true, force: true });
    return { sequence: release.sequence, version: release.version, mode: release.mode };
  } catch (error) {
    if (activated) await rm(root, { recursive: true, force: true });
    if (movedPrior) await rename(backup, root);
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
