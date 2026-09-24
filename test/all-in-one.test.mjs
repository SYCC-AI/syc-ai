import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_SETTINGS, classifyTask, createAllInOne, decisionsFrom, engineCommand, handoffPrompt,
  normalizeSettings, planEngines, readClaudeLine, readCodexLine, renderAgentsMd, suggestPriority,
} from '../all-in-one.mjs';

test('messages are sorted into plan, build and quick in several languages', () => {
  assert.equal(classifyTask('Fix the login bug in auth.js'), 'build');
  assert.equal(classifyTask('باگ صفحه ورود رو درست کن'), 'build');
  assert.equal(classifyTask('Explain the pros and cons of SQLite versus Postgres for a small shop, with a plan for moving later'), 'plan');
  assert.equal(classifyTask('What is a JWT?'), 'quick');
  assert.equal(classifyTask('چرا این کار رو کردی؟'), 'quick');
});

test('engine plan: route by task, then the other engines in the user order, skipping signed-out ones', () => {
  const settings = normalizeSettings({});
  assert.deepEqual(planEngines(settings, { task: 'build', ready: { claude: true, codex: true } }).map((c) => c.engine), ['codex', 'claude']);
  assert.deepEqual(planEngines(settings, { task: 'plan', ready: { claude: true, codex: true } }).map((c) => c.engine), ['claude', 'codex']);
  const quick = planEngines(settings, { task: 'quick', ready: { claude: true, codex: true } });
  assert.equal(quick[0].model, 'haiku');
  // Codex signed out: Claude answers a build message, and says why.
  const noCodex = planEngines(settings, { task: 'build', ready: { claude: true, codex: false } });
  assert.deepEqual(noCodex.map((c) => c.engine), ['claude']);
  assert.equal(noCodex[0].reason, 'not-ready-first');
  // Fallback off: only one engine is ever tried.
  assert.equal(planEngines(normalizeSettings({ fallback: false }), { task: 'build', ready: { claude: true, codex: true } }).length, 1);
  // The user's own choice wins over routing.
  assert.equal(planEngines(settings, { task: 'build', forced: 'claude', ready: {} })[0].engine, 'claude');
  assert.deepEqual(planEngines(settings, { task: 'build', ready: { claude: false, codex: false } }), []);
});

test('settings are validated: unknown engines, models and options are dropped', () => {
  const s = normalizeSettings({ order: ['codex', 'evil'], routes: { plan: { engine: 'codex', model: 'gpt-hack' }, build: { engine: 'nope' } }, permissions: 'root', language: 'fa', memory: 'x'.repeat(30_000), skills: ['caveman', 'context-mode', 'bogus'] });
  assert.deepEqual(s.order, ['codex', 'claude']);
  assert.deepEqual(s.routes.plan, { engine: 'codex', model: 'default' });
  assert.deepEqual(s.routes.build, DEFAULT_SETTINGS.routes.build);
  assert.equal(s.permissions, 'edit');
  assert.equal(s.language, 'fa');
  assert.equal(s.memory.length, 20_000);
  assert.deepEqual(s.skills, ['caveman']); // context-mode is not offered yet
});

test('handoff: a new engine gets the conversation so far, a returning one only what it missed', () => {
  const turns = [
    { index: 0, role: 'user', text: 'Build a todo app' },
    { index: 1, role: 'assistant', engine: 'claude', text: 'Plan: three files' },
    { index: 2, role: 'user', text: 'Now write it' },
    { index: 3, role: 'assistant', engine: 'codex', text: 'Wrote index.html' },
    { index: 4, role: 'user', text: 'Add dark mode' },
  ];
  const fresh = handoffPrompt({ turns, currentIndex: 4, engineState: null, text: 'Add dark mode' });
  assert.match(fresh, /joining a SYC-AI session/);
  assert.match(fresh, /\[Claude\] Plan: three files/);
  assert.match(fresh, /\[Codex\] Wrote index.html/);
  assert.ok(fresh.endsWith('Add dark mode'));
  const back = handoffPrompt({ turns, currentIndex: 4, engineState: { sessionId: 's1', lastTurn: 1 }, text: 'Add dark mode' });
  assert.doesNotMatch(back, /Plan: three files/);
  assert.match(back, /\[Codex\] Wrote index.html/);
  assert.equal(handoffPrompt({ turns, currentIndex: 4, engineState: { sessionId: 's2', lastTurn: 3 }, text: 'Add dark mode' }), 'Add dark mode');
});

test('AGENTS.md follows the settings and keeps the decisions engines wrote', () => {
  const md = renderAgentsMd(normalizeSettings({ language: 'fa', beginner: true, memory: 'My shop sells tea.' }), { decisions: '- Use SQLite' });
  assert.match(md, /Reply in Persian/);
  assert.match(md, /new to this/);
  assert.match(md, /My shop sells tea\./);
  assert.match(md, /Caveman by Julius Brussee \(MIT/);
  assert.match(md, /syc-node flag/);
  assert.equal(decisionsFrom(md), '- Use SQLite');
  assert.equal(decisionsFrom(renderAgentsMd(normalizeSettings({}))), '');
  assert.doesNotMatch(renderAgentsMd(normalizeSettings({ tokenSaver: false })), /Token saver/);
});

test('command lines: permissions map to each engine, resume keeps the conversation', () => {
  const settings = normalizeSettings({});
  const claude = engineCommand('claude', { model: 'haiku', settings, sessionId: 'abc' });
  assert.equal(claude.bin, 'claude');
  assert.deepEqual(claude.args.slice(0, 4), ['-p', '--output-format', 'stream-json', '--verbose']);
  assert.ok(claude.args.includes('--resume') && claude.args.includes('abc') && claude.args.includes('acceptEdits'));
  const codex = engineCommand('codex', { settings: normalizeSettings({ permissions: 'read' }), sessionId: 'thread-1' });
  assert.deepEqual(codex.args.slice(-3), ['resume', 'thread-1', '-']);
  assert.ok(codex.args.includes('read-only'));
  assert.ok(engineCommand('codex', { settings: normalizeSettings({ permissions: 'full' }) }).args.includes('danger-full-access'));
  assert.ok(engineCommand('claude', { settings: normalizeSettings({ permissions: 'full' }) }).args.includes('bypassPermissions'));
  // Every Claude run carries the SYC-AI rules and native deny rules for SYC-AI's own files, even with full access.
  const full = engineCommand('claude', { settings: normalizeSettings({ permissions: 'full' }) }).args;
  assert.match(full[full.indexOf('--append-system-prompt') + 1], /SYC-AI rules/);
  assert.ok(full.includes('Read(~/.syc-node/panel/**)') && full.includes('Edit(~/.syc-node/config.json)'));
  assert.ok(!full.some((a) => /workspace/.test(a) && a.startsWith('Edit(')), 'the workspace itself stays editable');
});

test('engine output is read: text, tools, usage windows and limits', () => {
  const now = Date.UTC(2026, 8, 24, 10, 0);
  assert.deepEqual(readClaudeLine('{"type":"system","subtype":"init","session_id":"s-1"}'), [{ type: 'session', id: 's-1' }]);
  const tool = readClaudeLine('{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"},{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}');
  assert.deepEqual(tool, [{ type: 'text', text: 'Hi' }, { type: 'tool', name: 'Bash', detail: 'ls' }]);
  const usage = readClaudeLine('{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1790271600,"unifiedWindows":{"five_hour":{"utilization":0.15,"resetsAt":1790271600},"seven_day":{"utilization":0.48,"resetsAt":1790715600}}}}', now);
  assert.equal(usage[0].usage.fiveHour.used, 15);
  assert.equal(usage[0].usage.weekly.used, 48);
  const limited = readClaudeLine('{"type":"result","is_error":true,"result":"You\'ve hit your limit · resets 4:50am (UTC)","session_id":"s-1"}', now);
  assert.equal(limited.find((e) => e.type === 'quota').resetsAt, Date.UTC(2026, 8, 25, 4, 50));
  assert.deepEqual(readCodexLine('{"type":"thread.started","thread_id":"t-9"}'), [{ type: 'session', id: 't-9' }]);
  assert.deepEqual(readCodexLine('{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}'), [{ type: 'text', text: 'Done' }]);
  assert.equal(readCodexLine('{"type":"turn.failed","error":{"message":"You\'ve hit your usage limit."}}')[0].type, 'quota');
  assert.equal(readCodexLine('{"type":"error","message":"stream disconnected"}')[0].type, 'error');
  assert.deepEqual(readCodexLine('not json'), []);
});

test('priority suggestion reads the kind of work, without calling any model', () => {
  assert.deepEqual(suggestPriority('I build websites and fix bugs in javascript and css').order, ['codex', 'claude']);
  assert.equal(suggestPriority('I write essays, research and translate').routes.build.engine, 'claude');
});

// A fake device: each spawn plays back a script of stdout lines.
function fakeDevice(scripts) {
  const calls = [];
  const files = new Map();
  const spawn = (deviceId, command) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    let input = '';
    child.stdin = { end(data) { input += data || ''; }, write(data) { input += data; } };
    child.kill = () => {};
    calls.push({ deviceId, ...command, get input() { return input; } });
    const lines = scripts.shift() || [];
    setTimeout(() => { for (const line of lines) child.stdout.emit('data', Buffer.from(`${JSON.stringify(line)}\n`)); child.emit('close', 0); }, 5);
    return child;
  };
  const deviceFs = {
    read: async (d, p) => { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p); },
    write: async (d, p, data) => { files.set(p, data); },
    rm: async (d, p) => { for (const k of [...files.keys()]) if (k.startsWith(p)) files.delete(k); },
  };
  return { calls, files, spawn, deviceFs };
}

async function service(scripts, ready = { claude: true, codex: true }) {
  const dataDir = mkdtempSync(join(tmpdir(), 'syc-aio-'));
  const device = fakeDevice(scripts);
  const alerts = [];
  const aio = createAllInOne({
    dataDir,
    devicesFor: async (u) => (u === 'ana' ? [{ deviceId: 'dev-1', name: 'Laptop', platform: 'linux', username: 'ana' }] : []),
    accountStatusQuick: async (u, d, app) => ({ app, installed: ready[app], loggedIn: ready[app] }),
    spawn: device.spawn, deviceFs: device.deviceFs, alert: (...a) => alerts.push(a),
    fetchSkillFile: async (skill) => [{ name: 'SKILL.md', content: `# ${skill.id}` }],
  });
  return { aio, device, alerts, cleanup: () => rmSync(dataDir, { recursive: true, force: true }) };
}

test('a full turn: Claude hits its limit, Codex continues the same message with the context', async () => {
  const { aio, device, cleanup } = await service([
    [{ type: 'system', subtype: 'init', session_id: 'c-1' }, { type: 'result', is_error: true, result: "You've hit your limit · resets 4:50am (UTC)", session_id: 'c-1' }],
    [{ type: 'thread.started', thread_id: 'x-1' }, { type: 'item.completed', item: { type: 'agent_message', text: 'Here is the plan.' } }, { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } }],
  ]);
  try {
    const session = aio.createSession('ana', {});
    const events = [];
    aio.subscribe('ana', session.id, (event, data) => events.push([event, data]));
    const { work } = await aio.sendMessage('ana', session.id, { text: 'Explain a plan for my shop website, step by step' });
    await work;
    const saved = aio.loadSession('ana', session.id);
    assert.deepEqual(saved.turns.map((t) => [t.role, t.engine || null]), [['user', null], ['assistant', 'claude'], ['assistant', 'codex']]);
    assert.ok(saved.turns[1].quota);
    assert.equal(saved.turns[2].text, 'Here is the plan.');
    assert.deepEqual(saved.engines, { claude: { sessionId: 'c-1', lastTurn: 1, slot: 1 }, codex: { sessionId: 'x-1', lastTurn: 2, slot: 1 } });
    assert.ok(events.some(([e, d]) => e === 'switch' && d.from === 'claude' && d.to === 'codex'));
    // Both engines ran in the same project folder, which holds the shared memory and the skills.
    assert.equal(device.calls[0].cwd, '~/.syc-node/workspace/syc-ai/main');
    assert.equal(device.calls[1].cwd, '~/.syc-node/workspace/syc-ai/main');
    assert.match(device.files.get('~/.syc-node/workspace/syc-ai/main/AGENTS.md'), /SYC-AI shared project memory/);
    assert.equal(device.files.get('~/.syc-node/workspace/syc-ai/main/CLAUDE.md'), '@AGENTS.md\n');
    assert.match(device.files.get('~/.syc-node/workspace/syc-ai/main/.claude/skills/caveman/NOTICE.md'), /Julius Brussee/);
    assert.equal(aio.state ? true : false, true);
    // The next message goes back to Claude with only what it missed.
    assert.equal(saved.title, 'Explain a plan for my shop website, step by step');
  } finally { cleanup(); }
});

test('busy sessions, empty messages, strangers and missing devices are refused', async () => {
  const { aio, cleanup } = await service([[{ type: 'result', is_error: false, result: 'ok' }]]);
  try {
    const session = aio.createSession('ana', {});
    await assert.rejects(aio.sendMessage('ana', session.id, { text: '  ' }), /empty_message/);
    await assert.rejects(aio.sendMessage('bob', session.id, { text: 'hi' }), /not_found/);
    const other = aio.createSession('bob', {});
    await assert.rejects(aio.sendMessage('bob', other.id, { text: 'hi' }), /no_device/);
    const { work } = await aio.sendMessage('ana', session.id, { text: 'hi' });
    await assert.rejects(aio.sendMessage('ana', session.id, { text: 'again' }), /busy/);
    await work;
    assert.throws(() => aio.loadSession('ana', '../../etc/passwd'), /not_found/);
  } finally { cleanup(); }
});

test('no signed-in engine: the session says what to do instead of failing silently', async () => {
  const { aio, cleanup } = await service([], { claude: false, codex: false });
  try {
    const session = aio.createSession('ana', {});
    const { work } = await aio.sendMessage('ana', session.id, { text: 'hello' });
    await work;
    const last = aio.loadSession('ana', session.id).turns.at(-1);
    assert.equal(last.code, 'no_engine');
  } finally { cleanup(); }
});

test('specialized sessions carry their brief to each engine the first time', async () => {
  const { aio, device, cleanup } = await service([[{ type: 'system', subtype: 'init', session_id: 'c-9' }, { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } }, { type: 'result', is_error: false, result: 'ok' }]]);
  try {
    const session = aio.createSession('ana', { templateId: 'review' });
    assert.equal(session.title, 'Code reviewer');
    const { work } = await aio.sendMessage('ana', session.id, { text: 'Review my project please' });
    await work;
    assert.match(device.calls[0].input, /Your role in this session: You review code and change nothing/);
    assert.ok(device.calls[0].args.includes('plan')); // the reviewer is read-only
    assert.match(aio.templateDownload('review'), /# Code reviewer/);
    assert.throws(() => aio.createSession('ana', { templateId: 'nope' }), /unknown_template/);
  } finally { cleanup(); }
});

test('a second account is used only when the user picks it, with its own login folder and a fresh conversation', async () => {
  const { aio, device, cleanup } = await service([
    [{ type: 'system', subtype: 'init', session_id: 'c-1' }, { type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] } }, { type: 'result', is_error: false }],
    [{ type: 'system', subtype: 'init', session_id: 'c-2' }, { type: 'assistant', message: { content: [{ type: 'text', text: 'two' }] } }, { type: 'result', is_error: false }],
  ], { claude: true, codex: true, 'claude-2': true });
  try {
    const session = aio.createSession('ana', {});
    await (await aio.sendMessage('ana', session.id, { text: 'Explain the plan please', engine: 'claude' })).work;
    assert.equal(device.calls[0].env, undefined);
    aio.saveSettings('ana', { accounts: { claude: 2 } });
    await (await aio.sendMessage('ana', session.id, { text: 'And the next step?', engine: 'claude' })).work;
    assert.deepEqual(device.calls[1].env, { CLAUDE_CONFIG_DIR: '~/.syc-node/accounts/claude-2' });
    assert.ok(!device.calls[1].args.includes('--resume'), 'another account starts its own conversation');
    assert.match(device.calls[1].input, /joining a SYC-AI session/);
    const saved = aio.loadSession('ana', session.id);
    assert.equal(saved.engines.claude.slot, 2);
    assert.equal(saved.turns.at(-1).account, 2);
    assert.deepEqual(normalizeSettings({ accounts: { claude: 3, codex: 2 } }).accounts, { claude: 1, codex: 2 });
  } finally { cleanup(); }
});
