import assert from 'node:assert/strict';
import { createHash, verify } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const generated = new Set(['sbom.spdx.json', 'provenance.intoto.json']);

async function filesUnder(directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === root && entry.name === '.git') continue;
    const path = join(directory, entry.name);
    const info = await lstat(path);
    if (info.isDirectory()) files.push(...await filesUnder(path));
    else files.push(relative(root, path).replaceAll('\\', '/'));
  }
  return files;
}

const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

test('publication evidence covers the exact candidate payload and verifies cryptographically', async () => {
  const allFiles = (await filesUnder()).sort();
  const payload = allFiles.filter((path) => !path.startsWith('evidence/') && !generated.has(path));
  const payloadLines = [];
  for (const path of payload) payloadLines.push(`${await sha256(join(root, path))}  ${path}\n`);
  const treeDigest = createHash('sha256').update(payloadLines.join('')).digest('hex');

  const sbom = JSON.parse(await readFile(join(root, 'sbom.spdx.json'), 'utf8'));
  assert.equal(sbom.spdxVersion, 'SPDX-2.3');
  assert.deepEqual(sbom.files.map(({ fileName }) => fileName.replace(/^\.\//, '')).sort(), payload);

  const provenance = JSON.parse(await readFile(join(root, 'provenance.intoto.json'), 'utf8'));
  assert.equal(provenance.subject[0].digest.sha256, treeDigest);

  const manifestPath = join(root, 'evidence', 'SHA256SUMS');
  const manifest = await readFile(manifestPath);
  const entries = manifest.toString('utf8').trimEnd().split('\n').map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert.ok(match, `invalid checksum line: ${line}`);
    return { digest: match[1], path: match[2] };
  });
  const expectedSigned = allFiles.filter((path) => !['evidence/SHA256SUMS', 'evidence/SHA256SUMS.sig'].includes(path));
  assert.deepEqual(entries.map(({ path }) => path), expectedSigned);
  for (const entry of entries) assert.equal(await sha256(join(root, entry.path)), entry.digest);

  const publicKey = await readFile(join(root, 'evidence', 'public-key.pem'));
  const signature = await readFile(join(root, 'evidence', 'SHA256SUMS.sig'));
  assert.equal(verify(null, manifest, publicKey, signature), true);
});
