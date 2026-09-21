import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolvePackageInputs } from '../installer/package-inputs.mjs';

test('provider runtimes resolve only from the explicit private input root', async () => {
  const base = await mkdtemp(join(tmpdir(), 'syc-private-inputs-'));
  const projectRoot = join(base, 'client');
  const privateRuntimeRoot = join(base, 'private');
  await mkdir(join(projectRoot, 'apps', 'claude'), { recursive: true });
  await mkdir(join(projectRoot, 'runtime', 'claude-code'), { recursive: true });
  await mkdir(join(privateRuntimeRoot, 'runtime', 'claude-code'), { recursive: true });

  assert.deepEqual(resolvePackageInputs({
    projectRoot,
    privateRuntimeRoot,
    paths: ['apps/claude', 'runtime/claude-code'],
  }), [
    { base: projectRoot, path: 'apps/claude' },
    { base: privateRuntimeRoot, path: 'runtime/claude-code' },
  ]);

  assert.throws(() => resolvePackageInputs({
    projectRoot,
    paths: ['runtime/claude-code'],
  }), /private runtime root is required/i);
});

test('package inputs reject missing or unsafe logical paths', async () => {
  const base = await mkdtemp(join(tmpdir(), 'syc-private-inputs-'));
  await mkdir(join(base, 'client'), { recursive: true });
  await mkdir(join(base, 'private'), { recursive: true });

  assert.throws(() => resolvePackageInputs({
    projectRoot: join(base, 'client'), privateRuntimeRoot: join(base, 'private'), paths: ['../data'],
  }), /unsafe package path/i);
  assert.throws(() => resolvePackageInputs({
    projectRoot: join(base, 'client'), privateRuntimeRoot: join(base, 'private'), paths: ['runtime/missing'],
  }), /missing package input/i);
});
