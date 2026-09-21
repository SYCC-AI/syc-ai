import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const assets = join(root, 'public', 'assets');

test('every bundled font has a hash-bound copyright and license notice', async () => {
  const inventory = JSON.parse(await readFile(join(root, 'third-party-fonts.json'), 'utf8'));
  const fonts = (await readdir(assets)).filter((name) => name.endsWith('.ttf')).sort();

  assert.deepEqual(inventory.map(({ file }) => file).sort(), fonts);

  for (const item of inventory) {
    assert.match(item.family, /\S/);
    assert.match(item.copyright, /^Copyright \d{4}/);
    assert.equal(item.license, 'OFL-1.1');
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    const bytes = await readFile(join(assets, item.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    await access(join(root, item.licenseFile));
  }
});
