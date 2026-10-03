// The one-line installers: Claude Code and Codex come with every Windows and
// Linux install (owner's rule: only the web version is without them), by the
// same npm install the panel's Install button runs; SYC_NODE_CLIS=no is the
// only way to skip it. install.ps1 must stay ASCII (irm decodes it as Latin-1).
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

test('install.sh installs Claude Code and Codex after sign-in unless told not to, in every language', () => {
  assert.match(sh, /want_clis="\$\{SYC_NODE_CLIS:-yes\}"/);
  assert.doesNotMatch(sh, /m clis\)/);
  assert.match(sh, /install -g --prefix "\$HOME_DIR\/npm" @anthropic-ai\/claude-code@latest @openai\/codex@latest/);
  for (const key of ['clising', 'clisok', 'clisfail']) {
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

test('install.ps1 does the same and stays ASCII', () => {
  assert.ok(/^[\x00-\x7f]*$/.test(ps1), 'install.ps1 must be ASCII');
  assert.match(ps1, /\$env:SYC_NODE_CLIS -ne 'no'/);
  assert.doesNotMatch(ps1, /Read-Host \(M 'clis'\)/);
  assert.match(ps1, /install -g --prefix \$npmPrefix '@anthropic-ai\/claude-code@latest' '@openai\/codex@latest'/);
  for (const key of ['clising', 'clisok', 'clisfail']) {
    for (const lang of LANGS) {
      const line = ps1.split('\n').find((l) => l.includes(`'${lang}:${key}'`));
      assert.ok(line, `install.ps1 is missing ${lang}:${key}`);
      const b64 = line.split('=').slice(1).join('=').trim().replace(/^'|'$/g, '');
      assert.ok(Buffer.from(b64, 'base64').toString('utf8').length > 3);
    }
  }
});

test('Windows background task: no script host (Defender flags a hidden .vbs launcher), and no second device on a re-run', () => {
  assert.doesNotMatch(ps1, /wscript/i);
  assert.doesNotMatch(ps1, /Set-Content[^\n]*\.vbs/i);
  assert.match(ps1, /conhost\.exe/);
  assert.match(ps1, /--headless/);
  assert.match(ps1, /already connected/i);
});
