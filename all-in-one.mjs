// SYC-AI (All in One): one session, one project folder and one shared memory
// for every AI engine the user has signed in on their own device.
//
// Each message goes to the engine that suits it (or the one the user picks).
// Engines keep their own conversation (Claude --resume, Codex exec resume);
// when an engine joins or comes back, it gets a short handoff with what the
// other engines did meanwhile, and every engine reads the same AGENTS.md in
// the same folder. When a subscription says its limit is reached, the turn can
// continue with the next *different* engine in the user's order — never with
// a second account of the same provider: that would only move the same limit.
//
// Everything runs on the user's device through SYC Node; this module only
// stores the conversation (per user, on the panel) and relays events.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CONNECTORS, IDEAS, SKILLS, TEMPLATES } from './all-in-one-catalog.mjs';
import { accountEnv } from './device-accounts.mjs';

export const ENGINES = Object.freeze({
  claude: { name: 'Claude', provider: 'anthropic', models: ['default', 'opus', 'sonnet', 'haiku'] },
  codex: { name: 'Codex', provider: 'openai', models: ['default'] },
});
const TASKS = ['plan', 'build', 'quick'];
const LANGUAGES = ['auto', 'en', 'zh', 'es', 'ar', 'ru', 'fa'];
const LANGUAGE_NAMES = { en: 'English', zh: 'Chinese', es: 'Spanish', ar: 'Arabic', ru: 'Russian', fa: 'Persian' };

export const DEFAULT_SETTINGS = Object.freeze({
  order: ['claude', 'codex'],
  routing: 'auto', // 'auto' = per message by task; 'first' = always the first engine in the order
  routes: {
    plan: { engine: 'claude', model: 'default' },
    build: { engine: 'codex', model: 'default' },
    quick: { engine: 'claude', model: 'haiku' },
  },
  fallback: true,
  permissions: 'edit', // 'read' | 'edit' | 'full'
  language: 'auto',
  style: 'balanced', // 'short' | 'balanced' | 'detailed'
  planFirst: true,
  beginner: false,
  tokenSaver: true,
  rememberDecisions: true,
  codexEffort: 'medium',
  project: 'main',
  memory: '',
  skills: ['caveman', 'token-efficient'],
  // Which signed-in account each engine uses: 1 or 2 (a second login on the
  // same device). The user picks; SYC-AI never changes it on its own.
  accounts: { claude: 1, codex: 1 },
});
// The account id on the device for an engine and a slot: 'claude' or 'claude-2'.
export const accountId = (engine, slot) => (slot === 2 ? `${engine}-2` : engine);

const SAFE_USER = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const SAFE_ID = /^[0-9a-f-]{36}$/;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,39}$/;
const clone = (value) => JSON.parse(JSON.stringify(value));

// ---- settings -------------------------------------------------------------------

export function normalizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const out = clone(base);
  const pick = (key, allowed) => { if (allowed.includes(input[key])) out[key] = input[key]; };
  if (Array.isArray(input.order)) {
    const order = [...new Set(input.order.filter((e) => ENGINES[e]))];
    for (const engine of Object.keys(ENGINES)) if (!order.includes(engine)) order.push(engine);
    out.order = order;
  }
  pick('routing', ['auto', 'first']);
  if (input.routes && typeof input.routes === 'object') {
    for (const task of TASKS) {
      const route = input.routes[task];
      if (!route || !ENGINES[route.engine]) continue;
      out.routes[task] = { engine: route.engine, model: ENGINES[route.engine].models.includes(route.model) ? route.model : 'default' };
    }
  }
  for (const key of ['fallback', 'planFirst', 'beginner', 'tokenSaver', 'rememberDecisions']) if (typeof input[key] === 'boolean') out[key] = input[key];
  pick('permissions', ['read', 'edit', 'full']);
  pick('language', LANGUAGES);
  pick('style', ['short', 'balanced', 'detailed']);
  pick('codexEffort', ['low', 'medium', 'high']);
  if (typeof input.project === 'string' && PROJECT.test(input.project)) out.project = input.project;
  if (typeof input.memory === 'string') out.memory = input.memory.slice(0, 20_000);
  if (input.accounts && typeof input.accounts === 'object') for (const engine of Object.keys(ENGINES)) if ([1, 2].includes(input.accounts[engine])) out.accounts[engine] = input.accounts[engine];
  if (Array.isArray(input.skills)) out.skills = [...new Set(input.skills.filter((id) => SKILLS.some((s) => s.id === id && !s.soon)))];
  return out;
}

// ---- which engine answers ---------------------------------------------------------

const BUILD_WORDS = /\b(fix|bug|error|implement|build|refactor|code|test|install|run|deploy|script|function|compile|debug|crash|endpoint|api|database|sql|css|html|react|python|javascript|typescript|npm|docker|git)\b|```|درست کن|باگ|خطا|بساز|کد|اجرا|نصب|تست|اسکریپت|ارور|修复|代码|错误|实现|ошибк|исправ|код|собер|arregl|código|error|implementa|أصلح|خطأ|كود|برمج/i;
const PLAN_WORDS = /\b(plan|design|explain|why|review|compare|strategy|idea|summar|translate|write|essay|email|research|advice|should i|pros and cons)\b|برنامه|طراحی|توضیح|چرا|بررسی|مقایسه|ایده|خلاصه|ترجمه|بنویس|تحقیق|پیشنهاد|计划|设计|解释|为什么|总结|翻译|план|объясн|почему|сравн|перевед|plan|diseñ|explica|por qué|resum|traduc|خطة|اشرح|لماذا|لخص|ترجم/i;

export function classifyTask(text) {
  const value = String(text || '').trim();
  const build = BUILD_WORDS.test(value);
  const plan = PLAN_WORDS.test(value);
  if (build && !plan) return 'build';
  if (plan && !build) return value.length < 160 && !/\n/.test(value) && /\?|؟|？$/.test(value) ? 'quick' : 'plan';
  if (build && plan) return /```/.test(value) ? 'build' : 'plan';
  return value.length < 160 && !/\n/.test(value) ? 'quick' : 'plan';
}

// The engines to try for one message, in order. `ready` maps engine → true
// (signed in), false (not installed / signed out) or undefined (not known yet).
export function planEngines(settings, { task, forced, ready = {}, templateRoutes } = {}) {
  const order = settings.order.filter((e) => ENGINES[e]);
  let first;
  let reason;
  if (forced && ENGINES[forced]) {
    first = { engine: forced, model: settings.routes[task]?.engine === forced ? settings.routes[task].model : 'default' };
    reason = 'chosen';
  } else if (settings.routing === 'first') {
    first = { engine: order[0], model: 'default' };
    reason = 'first';
  } else {
    const preferred = templateRoutes?.[task];
    first = preferred && ENGINES[preferred] ? { engine: preferred, model: settings.routes[task]?.engine === preferred ? settings.routes[task].model : 'default' } : clone(settings.routes[task] || { engine: order[0], model: 'default' });
    reason = task;
  }
  const list = [{ ...first, reason }];
  for (const engine of order) if (engine !== first.engine) list.push({ engine, model: 'default', reason: 'fallback' });
  const usable = list.filter((c) => ready[c.engine] !== false);
  if (!usable.length) return [];
  // The first usable engine always runs; the rest only as a fallback.
  if (usable[0].engine !== first.engine) usable[0] = { ...usable[0], reason: 'not-ready-first' };
  return settings.fallback ? usable : usable.slice(0, 1);
}

// Zero-token advice: from a description of the work, which engine should lead
// each kind of task. The page shows it and the user decides.
export function suggestPriority(text) {
  const value = String(text || '');
  const code = (value.match(new RegExp(BUILD_WORDS.source, 'gi')) || []).length;
  const words = (value.match(new RegExp(PLAN_WORDS.source, 'gi')) || []).length;
  const budget = /cheap|save|budget|limit|quota|token|ارزان|صرفه|سهمیه|توکن|便宜|省|дешев|эконом|barato|ahorr|رخيص|توفير/i.test(value);
  const notes = [];
  let routes;
  let order;
  if (code > words) {
    routes = { plan: { engine: 'claude', model: 'default' }, build: { engine: 'codex', model: 'default' }, quick: { engine: 'claude', model: 'haiku' } };
    order = ['codex', 'claude'];
    notes.push('Mostly building and fixing: Codex leads the building, Claude plans and reviews.');
  } else if (words > code) {
    routes = { plan: { engine: 'claude', model: 'default' }, build: { engine: 'claude', model: 'default' }, quick: { engine: 'claude', model: 'haiku' } };
    order = ['claude', 'codex'];
    notes.push('Mostly thinking, writing and research: Claude leads, Codex is the fallback.');
  } else {
    routes = clone(DEFAULT_SETTINGS.routes);
    order = ['claude', 'codex'];
    notes.push('A mix of planning and building: Claude plans, Codex builds.');
  }
  if (budget) notes.push('Token saver stays on, and short questions go to the lighter model.');
  notes.push('When one subscription reaches its limit, the next engine continues the same work.');
  return { order, routes, notes, tokenSaver: true };
}

// ---- handoff between engines --------------------------------------------------------

const clip = (text, max) => { const value = String(text || ''); return value.length > max ? `${value.slice(0, max)}…` : value; };

// What an engine must know before answering: the turns it has not seen (all
// of them when it joins for the first time), newest last, within a budget.
export function handoffPrompt({ turns, currentIndex, engineState, text, brief = '', maxChars = 8000 }) {
  const prior = turns.filter((t) => t.index < currentIndex && t.text && (t.role === 'user' || t.role === 'assistant'));
  const seenUpTo = engineState?.sessionId ? (engineState.lastTurn ?? -1) : -1;
  const missed = prior.filter((t) => (t.index ?? 0) > seenUpTo);
  const parts = [];
  if (brief && !engineState?.sessionId) parts.push(`Your role in this session: ${brief}`);
  if (missed.length) {
    const lines = [];
    let used = 0;
    for (const turn of [...missed].reverse()) {
      const who = turn.role === 'user' ? 'User' : ENGINES[turn.engine]?.name || 'Assistant';
      const line = `[${who}] ${clip(turn.text, 1500)}`;
      if (used + line.length > maxChars) break;
      lines.unshift(line); used += line.length;
    }
    const intro = engineState?.sessionId
      ? 'While you were away, other AI engines continued this work in the same project folder. What happened since your last answer (newest last):'
      : 'You are joining a SYC-AI session that other AI engines started in this same project folder. The conversation so far (newest last):';
    parts.push(`${intro}\n\n${lines.join('\n\n')}`);
  }
  if (!parts.length) return text;
  parts.push(`Continue from there. The user's new message:\n\n${text}`);
  return parts.join('\n\n---\n\n');
}

// ---- the shared memory file ---------------------------------------------------------

const TOKEN_RULES = [
  'No filler, no pleasantries, no repeating the question, no closing summary of what you just said.',
  'Keep code, commands, numbers and error text exact.',
  'Read a file before changing it; do not read the same file again unless it changed.',
  'Do not guess APIs, versions or flags: check the code or the docs first.',
];

export function renderAgentsMd(settings, { decisions = '' } = {}) {
  const lines = ['# SYC-AI shared project memory', '',
    '<!-- Written by SYC-AI. Every AI engine in this project (Claude, Codex and the others) reads this file.',
    '     Edit the memory in the SYC-AI panel: SYC-AI → Settings → Memory. The Decisions section is kept. -->', '',
    '## How to work with this user'];
  lines.push(settings.language === 'auto' ? '- Reply in the language the user writes in.' : `- Reply in ${LANGUAGE_NAMES[settings.language]}.`);
  lines.push({ short: '- Keep answers short: the result first, a few lines at most.', balanced: '- Keep answers clear and to the point.', detailed: '- Explain your reasoning and each step in detail.' }[settings.style]);
  if (settings.planFirst) lines.push('- Before a large or risky change, write a short plan and wait for the user to agree.');
  if (settings.beginner) lines.push('- The user is new to this: use plain words, explain each step, avoid jargon.');
  lines.push('- Work inside this project folder unless the user asks otherwise.');
  lines.push('- Other AI engines may have worked here before you. Read the Decisions below and continue their work; do not undo it without a reason.');
  if (settings.rememberDecisions) lines.push('- When you make a decision that matters later (a file layout, a library, a name), add one line under "## Decisions" in this file.');
  if (settings.tokenSaver) {
    lines.push('', '## Token saver (on)');
    for (const rule of TOKEN_RULES) lines.push(`- ${rule}`);
    if (settings.skills.includes('caveman')) lines.push('- Use the caveman skill at the lite level: professional and tight, full sentences, no filler.');
    const credited = SKILLS.filter((s) => s.category === 'tokens' && settings.skills.includes(s.id)).map((s) => `${s.name} by ${s.author} (${s.license}, ${s.url})`);
    if (credited.length) lines.push(`- Based on: ${credited.join('; ')}.`);
  }
  if (settings.memory.trim()) lines.push('', '## Memory from the user', '', settings.memory.trim());
  lines.push('', '## Decisions', '', decisions.trim() || '- (none yet)', '');
  return lines.join('\n');
}

export function decisionsFrom(agentsMd) {
  const match = /(?:^|\n)## Decisions\n([\s\S]*)$/.exec(String(agentsMd || ''));
  if (!match) return '';
  const body = match[1].trim();
  return body === '- (none yet)' ? '' : body.slice(0, 20_000);
}

// ---- engine command lines -------------------------------------------------------------

const CLAUDE_PROJECT_TOOLS = ['Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)', 'Bash(find:*)', 'Bash(wc:*)', 'Bash(mkdir:*)',
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git init:*)',
  'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)', 'Bash(python3:*)', 'Bash(python:*)', 'Bash(pip:*)', 'WebSearch', 'WebFetch'];

export function engineCommand(engine, { model = 'default', settings, sessionId }) {
  if (engine === 'claude') {
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];
    if (model !== 'default') args.push('--model', model);
    if (sessionId) args.push('--resume', sessionId);
    const mode = { read: 'plan', edit: 'acceptEdits', full: 'bypassPermissions' }[settings.permissions];
    args.push('--permission-mode', mode);
    if (settings.permissions === 'edit') args.push('--allowedTools', ...CLAUDE_PROJECT_TOOLS);
    return { bin: 'claude', args };
  }
  if (engine === 'codex') {
    const args = ['exec', '--json', '--skip-git-repo-check'];
    args.push('-s', { read: 'read-only', edit: 'workspace-write', full: 'danger-full-access' }[settings.permissions]);
    if (model !== 'default') args.push('-m', model);
    args.push('-c', `model_reasoning_effort="${settings.codexEffort}"`);
    if (sessionId) args.push('resume', sessionId, '-');
    else args.push('-');
    return { bin: 'codex', args };
  }
  throw new Error('unknown_engine');
}

// ---- reading what the engines print ---------------------------------------------------------

const QUOTA = /usage limit|hit your limit|limit reached|rate.?limit|quota|too many requests|\b429\b|out of (?:credits|messages)/i;

function claudeResetFromText(text, now) {
  const match = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*\(?\s*utc/i.exec(String(text || ''));
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (/pm/i.test(match[3] || '')) hour += 12;
  const at = new Date(now);
  const reset = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), hour, Number(match[2] || 0));
  return reset <= now ? reset + 86_400_000 : reset;
}

// One JSON line from `claude -p --output-format stream-json` → a list of events.
export function readClaudeLine(line, now = Date.now()) {
  let msg; try { msg = JSON.parse(line); } catch { return []; }
  const out = [];
  if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) out.push({ type: 'session', id: msg.session_id });
  else if (msg.type === 'assistant') {
    for (const block of msg.message?.content || []) {
      if (block.type === 'text' && block.text) out.push({ type: 'text', text: block.text });
      else if (block.type === 'tool_use') out.push({ type: 'tool', name: block.name, detail: clip(block.input?.command || block.input?.file_path || block.input?.pattern || block.input?.url || block.input?.query || block.input?.description || '', 160) });
    }
  } else if (msg.type === 'rate_limit_event' && msg.rate_limit_info) {
    const info = msg.rate_limit_info;
    const window = (w) => (w ? { used: Math.round(Number(w.utilization || 0) * 100), resetsAt: Number(w.resetsAt || 0) * 1000 || null } : null);
    out.push({ type: 'usage', usage: { status: info.status, fiveHour: window(info.unifiedWindows?.five_hour), weekly: window(info.unifiedWindows?.seven_day), resetsAt: Number(info.resetsAt || 0) * 1000 || null, at: now } });
    if (info.status === 'rejected') out.push({ type: 'quota', resetsAt: Number(info.resetsAt || 0) * 1000 || null });
  } else if (msg.type === 'result') {
    if (msg.session_id) out.push({ type: 'session', id: msg.session_id });
    const usage = msg.usage ? { input: (msg.usage.input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0), cached: msg.usage.cache_read_input_tokens || 0, output: msg.usage.output_tokens || 0 } : null;
    if (msg.is_error) {
      const text = String(msg.result || msg.subtype || 'error');
      if (QUOTA.test(text)) out.push({ type: 'quota', resetsAt: claudeResetFromText(text, now), message: clip(text, 300) });
      else out.push({ type: 'error', message: clip(text, 500) });
    }
    out.push({ type: 'done', usage });
  }
  return out;
}

// One JSON line from `codex exec --json` → a list of events.
export function readCodexLine(line) {
  let msg; try { msg = JSON.parse(line); } catch { return []; }
  const out = [];
  const item = msg.item || {};
  if (msg.type === 'thread.started' && msg.thread_id) out.push({ type: 'session', id: msg.thread_id });
  else if (msg.type === 'item.completed' && item.type === 'agent_message' && item.text) out.push({ type: 'text', text: item.text });
  else if (msg.type === 'item.started' && item.type === 'command_execution') out.push({ type: 'tool', name: 'Command', detail: clip(item.command, 160) });
  else if (msg.type === 'item.completed' && item.type === 'file_change') out.push({ type: 'tool', name: 'Edit', detail: clip((item.changes || []).map((c) => c.path).join(', '), 160) });
  else if (msg.type === 'item.started' && item.type === 'web_search') out.push({ type: 'tool', name: 'WebSearch', detail: clip(item.query, 160) });
  else if (msg.type === 'turn.completed') out.push({ type: 'done', usage: msg.usage ? { input: msg.usage.input_tokens || 0, cached: msg.usage.cached_input_tokens || 0, output: msg.usage.output_tokens || 0 } : null });
  else if (msg.type === 'turn.failed' || msg.type === 'error') {
    const text = String(msg.error?.message || msg.message || 'error');
    if (QUOTA.test(text)) out.push({ type: 'quota', resetsAt: null, message: clip(text, 300) });
    else out.push({ type: 'error', message: clip(text, 500) });
  }
  return out;
}

// ---- the service ------------------------------------------------------------------------------

export function createAllInOne({ dataDir, devicesFor, accountStatusQuick, spawn, deviceFs, alert = () => {}, fetchSkillFile, now = Date.now }) {
  const running = new Map(); // `${username}/${sessionId}` → { child, stopped }
  const listeners = new Map(); // same key → Set(emit)

  const userDir = (username) => {
    if (!SAFE_USER.test(username)) throw Object.assign(new Error('bad_user'), { status: 400 });
    const dir = join(dataDir, 'users', username, 'syc');
    mkdirSync(join(dir, 'sessions'), { recursive: true, mode: 0o700 });
    return dir;
  };
  const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
  const writeJson = (file, value) => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 }); renameSync(tmp, file); };

  const settingsOf = (username) => normalizeSettings(readJson(join(userDir(username), 'settings.json'), {}));
  const usageOf = (username) => readJson(join(userDir(username), 'usage.json'), {});
  const saveUsage = (username, engine, value) => { const all = usageOf(username); all[engine] = { ...(all[engine] || {}), ...value }; writeJson(join(userDir(username), 'usage.json'), all); };
  const ideaClicks = () => readJson(join(dataDir, 'syc-idea-clicks.json'), {});

  function sessionFile(username, id) {
    if (!SAFE_ID.test(id)) throw Object.assign(new Error('not_found'), { status: 404 });
    return join(userDir(username), 'sessions', `${id}.json`);
  }
  function loadSession(username, id) {
    const session = readJson(sessionFile(username, id), null);
    if (!session) throw Object.assign(new Error('not_found'), { status: 404 });
    return session;
  }
  const saveSession = (username, session) => { session.updatedAt = now(); writeJson(sessionFile(username, session.id), session); };

  function listSessions(username) {
    const dir = join(userDir(username), 'sessions');
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(dir, f), null)).filter(Boolean)
      .map((s) => ({ id: s.id, title: s.title, template: s.template || null, updatedAt: s.updatedAt, engines: [...new Set(s.turns.filter((t) => t.engine).map((t) => t.engine))], running: running.has(`${username}/${s.id}`) }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function ownedDevice(username, deviceId) {
    const devices = await devicesFor(username);
    const device = devices.find((d) => d.deviceId === deviceId) || (deviceId ? null : devices[0]);
    if (!device) throw Object.assign(new Error(devices.length ? 'device_not_found' : 'no_device'), { status: 409 });
    return device;
  }

  async function readiness(username, deviceId, settings = settingsOf(username)) {
    const ready = {};
    await Promise.all(Object.keys(ENGINES).map(async (engine) => {
      const status = await accountStatusQuick(username, deviceId, accountId(engine, settings.accounts[engine])).catch(() => null);
      ready[engine] = status?.checking || !status || status.error ? undefined : Boolean(status.installed && status.loggedIn);
    }));
    return ready;
  }

  function createSession(username, { title, templateId, deviceId } = {}) {
    const template = templateId ? TEMPLATES.find((t) => t.id === templateId) : null;
    if (templateId && !template) throw Object.assign(new Error('unknown_template'), { status: 404 });
    const session = {
      id: randomUUID(), title: clip(String(title || template?.title || 'New session').trim() || 'New session', 80),
      template: template?.id || null, deviceId: deviceId || null, createdAt: now(), updatedAt: now(), engines: {}, turns: [], nextIndex: 0,
    };
    saveSession(username, session);
    return session;
  }

  // Keep the project's AGENTS.md (and the CLAUDE.md that points at it) and the
  // chosen skills in step with the settings, keeping the Decisions engines wrote.
  async function prepareProject(username, deviceId, settings) {
    const root = `~/.syc-node/workspace/syc-ai/${settings.project}`;
    let decisions = '';
    try { decisions = decisionsFrom(await deviceFs.read(deviceId, `${root}/AGENTS.md`)); } catch { /* first run */ }
    await deviceFs.write(deviceId, `${root}/AGENTS.md`, renderAgentsMd(settings, { decisions }));
    await deviceFs.write(deviceId, `${root}/CLAUDE.md`, '@AGENTS.md\n');
    const markerFile = join(userDir(username), `skills-${deviceId}-${settings.project}.json`);
    const installed = readJson(markerFile, {});
    for (const skill of SKILLS.filter((s) => s.repo && settings.skills.includes(s.id) && installed[s.id] !== s.commit)) {
      if (!fetchSkillFile) break;
      try {
        const files = await fetchSkillFile(skill);
        for (const file of files) await deviceFs.write(deviceId, `${root}/.claude/skills/${skill.id}/${file.name}`, file.content);
        await deviceFs.write(deviceId, `${root}/.claude/skills/${skill.id}/NOTICE.md`, `${skill.name} by ${skill.author}\nLicense: ${skill.license}\nSource: ${skill.url} (commit ${skill.commit})\nInstalled by SYC-AI with thanks to the author.\n`);
        installed[skill.id] = skill.commit;
      } catch { /* try again next turn */ }
    }
    for (const id of Object.keys(installed)) {
      if (settings.skills.includes(id)) continue;
      try { await deviceFs.rm(deviceId, `${root}/.claude/skills/${id}`); } catch { /* already gone */ }
      delete installed[id];
    }
    writeJson(markerFile, installed);
    return root;
  }

  function broadcast(key, event, data) { for (const emit of listeners.get(key) || []) { try { emit(event, data); } catch { /* listener gone */ } } }

  // Run one engine for one message. Resolves with what happened; never throws.
  function runEngine({ deviceId, cwd, engine, model, prompt, settings, engineState, key, onEvent }) {
    return new Promise((resolve) => {
      const { bin, args } = engineCommand(engine, { model, settings, sessionId: engineState?.sessionId });
      const env = accountEnv(accountId(engine, settings.accounts[engine]));
      const child = spawn(deviceId, { bin, args, cwd, timeoutMs: 3 * 60 * 60 * 1000, ...(env ? { env } : {}) });
      const state = running.get(key);
      if (state) state.child = child;
      const result = { texts: [], tools: [], sessionId: engineState?.sessionId || null, usage: null, quota: null, error: null };
      const read = engine === 'claude' ? readClaudeLine : readCodexLine;
      let buffer = ''; let stderr = '';
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
          if (!line.startsWith('{')) continue;
          for (const event of read(line, now())) {
            if (event.type === 'session') result.sessionId = event.id;
            else if (event.type === 'text') { result.texts.push(event.text); onEvent('text', { engine, text: event.text }); }
            else if (event.type === 'tool') { result.tools.push({ name: event.name, detail: event.detail }); onEvent('tool', { engine, name: event.name, detail: event.detail }); }
            else if (event.type === 'usage') { onEvent('usage', { engine, usage: event.usage }); result.accountUsage = event.usage; }
            else if (event.type === 'quota') result.quota = { resetsAt: event.resetsAt || null, message: event.message || '' };
            else if (event.type === 'error') result.error = event.message;
            else if (event.type === 'done') result.usage = event.usage;
          }
        }
      });
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-4000); });
      child.on('error', () => {});
      child.stdin.end(prompt);
      child.on('close', (code) => {
        if (!result.quota && QUOTA.test(stderr) && code !== 0) result.quota = { resetsAt: null, message: clip(stderr.trim().split('\n').pop(), 300) };
        if (child.spawnError) result.error = child.spawnError === 'device_paused' ? 'device_paused' : 'device_unavailable';
        else if (!result.texts.length && !result.quota && !result.error && code !== 0) result.error = clip(stderr.trim().split('\n').slice(-3).join(' ') || `exit ${code}`, 500);
        result.stopped = running.get(key)?.stopped || false;
        resolve(result);
      });
    });
  }

  async function sendMessage(username, sessionId, { text, engine: forced, deviceId: wantedDevice } = {}) {
    const key = `${username}/${sessionId}`;
    const message = String(text || '').trim();
    if (!message) throw Object.assign(new Error('empty_message'), { status: 400 });
    if (running.has(key)) throw Object.assign(new Error('busy'), { status: 409 });
    const session = loadSession(username, sessionId);
    const settings = settingsOf(username);
    const template = session.template ? TEMPLATES.find((t) => t.id === session.template) : null;
    if (template?.permissions === 'read') settings.permissions = 'read';
    running.set(key, { child: null, stopped: false, startedAt: now() });
    let device;
    try { device = await ownedDevice(username, wantedDevice || session.deviceId || ''); }
    catch (error) { running.delete(key); throw error; }
    session.deviceId = device.deviceId;
    const emit = (event, data) => broadcast(key, event, data);
    const task = classifyTask(message);
    const userTurn = { index: session.nextIndex++, role: 'user', text: message.slice(0, 100_000), at: now() };
    session.turns.push(userTurn);
    if (session.turns.length === 1 && session.title === 'New session') session.title = clip(message.replace(/\s+/g, ' '), 60);
    saveSession(username, session);
    emit('user', { turn: userTurn });
    const work = (async () => { try {
      const ready = await readiness(username, device.deviceId);
      const candidates = planEngines(settings, { task, forced: forced === 'auto' ? null : forced, ready, templateRoutes: template?.routes });
      if (!candidates.length) {
        const turn = { index: session.nextIndex++, role: 'system', text: 'No AI engine is signed in on this device yet. Open Professional accounts, install Claude or Codex on this device and sign in.', code: 'no_engine', at: now() };
        session.turns.push(turn); saveSession(username, session); emit('turn', { turn });
        return;
      }
      const cwd = await prepareProject(username, device.deviceId, settings);
      const started = now();
      for (let i = 0; i < candidates.length; i += 1) {
        const { engine, model, reason } = candidates[i];
        const slot = settings.accounts[engine];
        // A conversation lives in one account's own history: another account starts fresh (with the handoff).
        const engineState = session.engines[engine] && (session.engines[engine].slot || 1) === slot ? session.engines[engine] : null;
        const usageKey = accountId(engine, slot);
        const prompt = handoffPrompt({ turns: session.turns, currentIndex: userTurn.index, engineState, text: message, brief: template?.brief });
        emit('route', { engine, model, reason, task });
        const result = await runEngine({ deviceId: device.deviceId, cwd, engine, model, prompt, settings, engineState, key, onEvent: emit });
        if (result.accountUsage) saveUsage(username, usageKey, { ...result.accountUsage, deviceId: device.deviceId });
        if (result.quota) saveUsage(username, usageKey, { limited: true, limitedUntil: result.quota.resetsAt || null, at: now() });
        else if (!result.error) saveUsage(username, usageKey, { limited: false });
        const turn = {
          index: session.nextIndex++, role: 'assistant', engine, model, task, reason, text: result.texts.join('\n\n').slice(0, 200_000),
          tools: result.tools.slice(0, 200), usage: result.usage, at: now(),
          ...(result.quota ? { quota: result.quota } : {}), ...(result.error ? { error: result.error } : {}), ...(result.stopped ? { stopped: true } : {}),
        };
        if (result.sessionId) session.engines[engine] = { sessionId: result.sessionId, lastTurn: turn.index, slot };
        if (slot === 2) turn.account = 2;
        session.turns.push(turn);
        saveSession(username, session);
        emit('turn', { turn });
        if (result.stopped) break;
        const next = candidates[i + 1];
        if (result.quota && next) {
          emit('switch', { from: engine, to: next.engine, resetsAt: result.quota.resetsAt });
          continue;
        }
        break;
      }
      if (now() - started > 60_000) alert(username, 'SYC-AI: your task is done', clip(session.title, 100));
    } catch (error) {
      const turn = { index: session.nextIndex++, role: 'system', text: error.message === 'no_device' ? 'Connect a device first (Connection → Get SYC-AI).' : `Something went wrong: ${error.message}`, code: error.message, at: now() };
      session.turns.push(turn); saveSession(username, session); emit('turn', { turn });
    } finally {
      running.delete(key);
      emit('idle', {});
    } })();
    return { turn: userTurn, work };
  }

  function stop(username, sessionId) {
    const state = running.get(`${username}/${sessionId}`);
    if (!state) return false;
    state.stopped = true;
    try { state.child?.kill('SIGTERM'); } catch { /* already gone */ }
    return true;
  }

  function subscribe(username, sessionId, emit) {
    const key = `${username}/${sessionId}`;
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(emit);
    return () => { listeners.get(key)?.delete(emit); if (!listeners.get(key)?.size) listeners.delete(key); };
  }

  // Codex tells its own remaining quota through the app-server: one
  // initialize, one read, then the process ends. Nothing is sent to a model.
  function readCodexUsage(deviceId, slot = 1) {
    return new Promise((resolve) => {
      const env = accountEnv(accountId('codex', slot));
      const child = spawn(deviceId, { bin: 'codex', args: ['app-server'], timeoutMs: 45_000, ...(env ? { env } : {}) });
      let buffer = ''; let done = false;
      const finish = (value) => { if (done) return; done = true; try { child.kill('SIGTERM'); } catch { /* gone */ } resolve(value); };
      const timer = setTimeout(() => finish(null), 40_000);
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
          let msg; try { msg = JSON.parse(line); } catch { continue; }
          if (msg.id === 1) {
            child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
            child.stdin.write(`${JSON.stringify({ method: 'account/rateLimits/read', id: 2, params: {} })}\n`);
          } else if (msg.id === 2) { clearTimeout(timer); finish(msg.result || null); }
        }
      });
      child.stderr.on('data', () => {});
      child.on('error', () => {});
      child.on('close', () => { clearTimeout(timer); finish(null); });
      child.stdin.write(`${JSON.stringify({ method: 'initialize', id: 1, params: { clientInfo: { name: 'syc_ai', title: 'SYC-AI', version: '0.7.2' } } })}\n`);
    });
  }

  function normalizeCodexUsage(result) {
    const limits = result?.rateLimitsByLimitId?.codex || result?.rateLimits || {};
    const window = (w) => (w && Number.isFinite(Number(w.usedPercent)) ? { used: Math.round(Number(w.usedPercent)), resetsAt: Number(w.resetsAt) ? (Number(w.resetsAt) < 1e12 ? Number(w.resetsAt) * 1000 : Number(w.resetsAt)) : null, windowMins: Number(w.windowDurationMins) || null } : null);
    return { primary: window(limits.primary), secondary: window(limits.secondary), plan: limits.planType || result?.planType || null, at: now() };
  }

  async function state(username, { deviceId } = {}) {
    const devices = await devicesFor(username);
    const device = devices.find((d) => d.deviceId === deviceId) || devices[0] || null;
    const ready = device ? await readiness(username, device.deviceId) : {};
    return {
      settings: settingsOf(username), sessions: listSessions(username), usage: usageOf(username),
      devices: devices.map((d) => ({ deviceId: d.deviceId, name: d.name, platform: d.platform })), deviceId: device?.deviceId || null,
      engines: Object.fromEntries(Object.entries(ENGINES).map(([id, e]) => [id, { ...e, ready: ready[id] ?? null }])),
      templates: TEMPLATES, skills: SKILLS, connectors: CONNECTORS,
    };
  }

  async function refreshUsage(username, deviceId) {
    const device = await ownedDevice(username, deviceId || '');
    const slot = settingsOf(username).accounts.codex;
    const result = await readCodexUsage(device.deviceId, slot);
    if (result) saveUsage(username, accountId('codex', slot), { ...normalizeCodexUsage(result), deviceId: device.deviceId });
    return usageOf(username);
  }

  function countIdea(id) {
    if (!IDEAS.some((idea) => idea.id === id)) return false;
    const clicks = ideaClicks();
    clicks[id] = (clicks[id] || 0) + 1;
    writeJson(join(dataDir, 'syc-idea-clicks.json'), clicks);
    return true;
  }

  function deleteSession(username, sessionId) {
    stop(username, sessionId);
    const file = sessionFile(username, sessionId);
    if (!existsSync(file)) throw Object.assign(new Error('not_found'), { status: 404 });
    rmSync(file);
  }

  function renameSession(username, sessionId, title) {
    const session = loadSession(username, sessionId);
    session.title = clip(String(title || '').trim() || session.title, 80);
    saveSession(username, session);
    return session;
  }

  function saveSettings(username, input) {
    const settings = normalizeSettings(input, settingsOf(username));
    writeJson(join(userDir(username), 'settings.json'), settings);
    return settings;
  }

  function templateDownload(id) {
    const template = TEMPLATES.find((t) => t.id === id);
    if (!template) throw Object.assign(new Error('not_found'), { status: 404 });
    return `# ${template.title} — a SYC-AI specialized session\n\n${template.blurb}\n\n## Your role\n\n${template.brief}\n\n## First message to try\n\n${template.starter}\n\n---\nPut this file in a project folder as AGENTS.md (Codex and most agents) and add a CLAUDE.md containing "@AGENTS.md" for Claude Code.\nFrom SYC-AI — All You Need With AI, In One: https://syc-ai.com\n`;
  }

  return {
    state, createSession, loadSession, listSessions, sendMessage, stop, subscribe, deleteSession, renameSession,
    saveSettings, settingsOf, refreshUsage, countIdea, ideaClicks, templateDownload, isRunning: (u, id) => running.has(`${u}/${id}`),
  };
}
