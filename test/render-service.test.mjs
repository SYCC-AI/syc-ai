import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const project = resolve(import.meta.dirname, '..');
const renderer = join(project, 'installer', 'render-service.mjs');

test('core service loads protected central runtime configuration', async () => {
  const base = await mkdtemp(join(tmpdir(), 'syc-render-service-'));
  const root = join(base, 'install');
  const systemd = join(base, 'systemd');
  await mkdir(root);
  await mkdir(systemd);
  const result = await new Promise((resolveRun) => {
    const child = spawn(process.execPath, [renderer, root, 'syc-ai-test', 'core', '28782'], {
      env: { ...process.env, SYC_SYSTEMD_DIR: systemd }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => resolveRun({ code, output }));
  });
  assert.equal(result.code, 0, result.output);
  const unit = await readFile(join(systemd, 'syc-ai-test.service'), 'utf8');
  assert.match(unit, new RegExp(`^EnvironmentFile=-${root}/data/runtime\\.env$`, 'm'));
  assert.match(unit, /^Environment=SYC_AI_PORT=28782$/m);
});

test('the core unit can write the parent directory, or a forced update dies with EROFS', async () => {
  const base = await mkdtemp(join(tmpdir(), 'syc-render-parent-'));
  const root = join(base, 'install');
  const systemd = join(base, 'systemd');
  await mkdir(root);
  await mkdir(systemd);
  const code = await new Promise((done) => {
    const child = spawn(process.execPath, [renderer, root, 'syc-ai-test', 'core', '28783'], {
      env: { ...process.env, SYC_SYSTEMD_DIR: systemd }, stdio: 'ignore',
    });
    child.on('close', done);
  });
  assert.equal(code, 0);
  const unit = await readFile(join(systemd, 'syc-ai-test.service'), 'utf8');
  const paths = (/^ReadWritePaths=(.*)$/m.exec(unit)?.[1] ?? '').split(' ');
  // applyUpdate stages the new tree and backs the old one up *beside* the
  // root, so without the parent every forced update fails with EROFS.
  assert.ok(paths.includes(base), `the parent must be writable; got "${paths.join(' ')}"`);
  assert.ok(paths.includes(root), 'the install root itself must stay writable');
});
