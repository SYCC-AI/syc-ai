import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SAFE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export function resolvePackageInputs({ projectRoot, privateRuntimeRoot, paths } = {}) {
  const project = resolve(String(projectRoot || ''));
  const privateRoot = privateRuntimeRoot ? resolve(String(privateRuntimeRoot)) : '';
  if (!Array.isArray(paths)) throw new TypeError('package paths are required');

  return paths.map((path) => {
    if (!SAFE_PATH.test(String(path || '')) || String(path).split('/').includes('..')) {
      throw new Error(`unsafe package path: ${path}`);
    }
    const runtime = path.startsWith('runtime/');
    if (runtime && !privateRoot) throw new Error('private runtime root is required');
    const base = runtime ? privateRoot : project;
    if (!existsSync(join(base, path))) throw new Error(`missing package input: ${path}`);
    return Object.freeze({ base, path });
  });
}
