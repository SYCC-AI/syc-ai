import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import test from 'node:test';

const project = resolve(import.meta.dirname, '..');

function covered(path, includes) {
  const name = relative(project, path).replaceAll('\\', '/');
  return includes.some((entry) => name === entry || name.startsWith(`${entry}/`));
}

test('core release includes the complete relative-import closure of its server entrypoint', async () => {
  const registry = JSON.parse(await readFile(join(project, 'installer', 'panels.json'), 'utf8'));
  const includes = registry.core.include;
  const pending = [join(project, registry.core.entry)];
  const visited = new Set();
  const missing = [];

  while (pending.length) {
    const file = normalize(pending.pop());
    if (visited.has(file)) continue;
    visited.add(file);
    if (!covered(file, includes)) missing.push(relative(project, file));
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g)) {
      const dependency = resolve(dirname(file), match[2]);
      pending.push(dependency);
    }
  }

  assert.deepEqual(missing.sort(), []);
});

test('every configured core package path exists in a clean checkout', async () => {
  const registry = JSON.parse(await readFile(join(project, 'installer', 'panels.json'), 'utf8'));
  const missing = [];
  for (const entry of registry.core.include) {
    try { await access(join(project, entry)); } catch { missing.push(entry); }
  }
  assert.deepEqual(missing, []);
});
