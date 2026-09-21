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
