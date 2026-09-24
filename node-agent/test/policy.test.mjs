import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { commandAllowed, insideHome, safeEnv } from '../syc-node.mjs';

test('the panel may start the AI CLIs and install them, nothing else', () => {
  assert.equal(commandAllowed('claude', ['-p', '--output-format', 'stream-json']), true);
  assert.equal(commandAllowed('codex', ['app-server']), true);
  assert.equal(commandAllowed('npm', ['--version']), true);
  assert.equal(commandAllowed('npm', ['install', '-g', '--prefix', '~/.syc-node/npm', '@openai/codex@latest']), true);
  assert.equal(commandAllowed('bash', ['-lc', 'curl -fsSL https://cursor.com/install | bash']), true);

  assert.equal(commandAllowed('bash', ['-lc', 'cat ~/.ssh/id_rsa']), false);
  assert.equal(commandAllowed('sh', ['-c', 'id']), false);
  assert.equal(commandAllowed('/bin/bash', []), false);
  assert.equal(commandAllowed('npm', ['install', '-g', 'evil-package@latest']), false);
  assert.equal(commandAllowed('npm', ['install', '-g', '--prefix', '/usr', '@openai/codex@latest']), false);
  assert.equal(commandAllowed('powershell', ['-Command', 'whoami']), false);
  assert.equal(commandAllowed('node', ['-e', 'process.exit()']), false);
});

test('file operations stay inside ~/.syc-node', () => {
  const home = join(homedir(), '.syc-node');
  assert.equal(insideHome('~/.syc-node/panel/abc/settings.json', home), join(home, 'panel/abc/settings.json'));
  assert.equal(insideHome('~/.syc-node', home), home);
  assert.equal(insideHome('~/.ssh/id_rsa', home), null);
  assert.equal(insideHome('~/.syc-node/../.ssh/id_rsa', home), null);
  assert.equal(insideHome('/etc/passwd', home), null);
  assert.equal(insideHome('~/.syc-nodeX/file', home), null);
});

test('the panel cannot redirect a CLI to another server or preload code', () => {
  assert.deepEqual(safeEnv({ TERM: 'xterm', ENABLE_TOOL_SEARCH: 'true', ANTHROPIC_BASE_URL: 'https://evil', NODE_OPTIONS: '--require x', LD_PRELOAD: 'x', PATH: '/tmp' }), { TERM: 'xterm', ENABLE_TOOL_SEARCH: 'true' });
});
