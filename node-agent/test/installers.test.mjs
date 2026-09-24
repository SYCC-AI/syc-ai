// The one-line installers: the optional Claude Code + Codex step must run the
// same npm install the panel's Install button runs, and install.ps1 must stay
// ASCII (irm decodes it as Latin-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sh = readFileSync(join(here, '..', 'install.sh'), 'utf8');
const ps1 = readFileSync(join(here, '..', 'install.ps1'), 'utf8');
const LANGS = ['en', 'fa', 'ar', 'ru', 'zh', 'es'];

test('install.sh offers Claude Code and Codex after sign-in, in every language', () => {
  assert.match(sh, /SYC_NODE_CLIS/);
  assert.match(sh, /install -g --prefix "\$HOME_DIR\/npm" @anthropic-ai\/claude-code@latest @openai\/codex@latest/);
  for (const key of ['clis', 'clising', 'clisok', 'clisfail']) {
    for (const lang of LANGS) {
      const tag = lang === 'en' ? `*:${key})` : `${lang}:${key})`;
      assert.ok(sh.includes(tag), `install.sh is missing ${tag}`);
    }
  }
  // The offer comes after the sign-in and before the background service.
  assert.ok(sh.indexOf('SYC_NODE_CLIS') > sh.indexOf('"$(m signin)"'));
  assert.ok(sh.indexOf('SYC_NODE_CLIS') < sh.indexOf('start_background() {'));
  execFileSync('bash', ['-n', join(here, '..', 'install.sh')]);
});

test('install.ps1 offers the same step and stays ASCII', () => {
  assert.ok(/^[\x00-\x7f]*$/.test(ps1), 'install.ps1 must be ASCII');
  assert.match(ps1, /SYC_NODE_CLIS/);
  assert.match(ps1, /install -g --prefix \$npmPrefix '@anthropic-ai\/claude-code@latest' '@openai\/codex@latest'/);
  for (const key of ['clis', 'clising', 'clisok', 'clisfail']) {
    for (const lang of LANGS) {
      const line = ps1.split('\n').find((l) => l.includes(`'${lang}:${key}'`));
      assert.ok(line, `install.ps1 is missing ${lang}:${key}`);
      const b64 = line.split('=').slice(1).join('=').trim().replace(/^'|'$/g, '');
      assert.ok(Buffer.from(b64, 'base64').toString('utf8').length > 3);
    }
  }
});
