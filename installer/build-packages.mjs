#!/usr/bin/env node
// Builds distributable install packages from this reviewed client checkout
// into installer/dist/. Publication and download endpoints are configured only
// after release approval.
//
//   core.tar.zst        the panel shell (login, /main, /profage, connection…)
//   panel-<id>.tar.zst  one professional account (its app + its CLI runtime)
//   full.tar.zst        core + the bundled accounts (Claude + Codex)
//   manifest.json       versions, sizes, sha256, ports — what the clients read
//
// Nothing here embeds our server paths, accounts or secrets: only source, the
// panel shells and the CLI runtimes travel. Per-user data is created on install.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSignedRelease } from './release-builder.mjs';
import { resolveBuildTargets } from './build-plan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(HERE, 'dist');
const reg = JSON.parse(readFileSync(join(HERE, 'panels.json'), 'utf8'));
const targets = resolveBuildTargets(process.env.SYC_BUILD_TARGETS);

// Junk that must never travel in a package.
const EXCLUDES = ['--exclude=.git', '--exclude=node_modules/.cache', '--exclude=*.log',
  '--exclude=.DS_Store', '--exclude=data', '--exclude=.gradle'];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const mb = (n) => (n / 1048576).toFixed(1);

function pack(name, paths) {
  const out = join(DIST, `${name}.tar.zst`);
  // Verify every path exists so a package is never silently short.
  for (const p of paths) {
    if (!existsSync(join(ROOT, p))) throw new Error(`missing path for ${name}: ${p}`);
  }
  const list = paths.map((p) => `'${p}'`).join(' ');
  execSync(`tar ${EXCLUDES.join(' ')} -C '${ROOT}' -cf - ${list} | zstd -19 -T0 -q -o '${out}' -f`,
    { stdio: ['ignore', 'ignore', 'inherit'], shell: '/bin/bash' });
  const size = statSync(out).size;
  console.log(`  ${name.padEnd(18)} ${mb(size).padStart(7)} MB`);
  return { file: `${name}.tar.zst`, bytes: size, sha256: sha256(out) };
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
console.log(`Building ${reg.product} ${reg.version} packages →`, DIST);

const manifest = {
  product: reg.product, version: reg.version, node_min: reg.node_min,
  built: new Date().toISOString(), bundled: reg.bundled, core: null, full: null, panels: {},
};

console.log('core:');
if (targets.core) manifest.core = { port: reg.core.port, ...pack('core', reg.core.include) };

if (targets.panels) {
  console.log('panels:');
  for (const [id, p] of Object.entries(reg.panels)) {
    manifest.panels[id] = {
      name: p.name, order: p.order, port: p.port,
      ...pack(`panel-${id}`, p.include),
    };
  }
}

if (targets.full) {
  console.log('full bundle (core + ' + reg.bundled.join(' + ') + '):');
  const fullPaths = [...reg.core.include, ...reg.bundled.flatMap((id) => reg.panels[id].include)];
  manifest.full = { includes: ['core', ...reg.bundled], ...pack('full', fullPaths) };
}

const signingKeyFile = process.env.SYC_RELEASE_SIGNING_KEY_FILE;
const sequence = Number(process.env.SYC_RELEASE_SEQUENCE);
if (!signingKeyFile || !Number.isSafeInteger(sequence) || sequence < 1) {
  throw new Error('SYC_RELEASE_SIGNING_KEY_FILE and positive SYC_RELEASE_SEQUENCE are required');
}
const issuedAt = new Date().toISOString();
const expiresAt = process.env.SYC_RELEASE_EXPIRES_AT || new Date(Date.parse(issuedAt) + 24 * 60 * 60 * 1000).toISOString();
const signed = createSignedRelease({
  privateKey: readFileSync(signingKeyFile, 'utf8'), sequence, version: reg.version,
  issuedAt, expiresAt, minimumVersion: process.env.SYC_MINIMUM_VERSION || reg.version,
  mode: process.env.SYC_RELEASE_MODE || 'optional',
  assets: Object.fromEntries(Object.entries({ core: manifest.core, full: manifest.full }).filter(([, asset]) => asset)),
  extra: { product: reg.product, nodeMin: reg.node_min, bundled: targets.full ? reg.bundled : [], panels: manifest.panels },
});
writeFileSync(join(DIST, 'manifest.json'), `${JSON.stringify(signed.metadata, null, 2)}\n`);
writeFileSync(join(DIST, 'manifest.sig'), `${signed.signature}\n`);
const total = (manifest.core?.bytes || 0) + Object.values(manifest.panels).reduce((s, p) => s + p.bytes, 0);
console.log(`\nmanifest.json written. selected artifacts = ${mb(total + (manifest.full?.bytes || 0))} MB.`);
