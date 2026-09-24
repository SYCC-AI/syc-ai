// SYC-AI (All in One) page: sessions, one conversation across engines, usage
// of every connected account and the settings that shape how engines work.
const t = (s) => (window.SYC?.t ? window.SYC.t(s) : s);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.error || String(response.status)), { status: response.status, value });
  return value;
}

const ENGINE_LOGO = { claude: '/assets/claude-color.svg', codex: '/assets/codex-color.svg' };
const ENGINE_NAME = { claude: 'Claude', codex: 'Codex' };
const MODEL_NAME = { default: 'Default model', opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku (light)' };
const TASK_NAME = { plan: 'Planning and writing', build: 'Building and fixing', quick: 'Short questions' };
const REASON = {
  plan: 'Planning and writing', build: 'Building and fixing', quick: 'Short question', chosen: 'Your choice',
  first: 'First in your order', fallback: 'Took over after a limit', 'not-ready-first': 'The usual engine is not signed in on this device',
};
const ICONS = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  bug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7V4M9 4l1.5 3M15 4l-1.5 3M4 12h3M17 12h3M4 18l3-2M20 18l-3-2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  chart: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v4M5 13h4M16 12h.01M18 14h.01"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.globe}</svg>`;

// Small, safe Markdown: code blocks, inline code, bold, links, lists, headings.
// Each paragraph keeps its own direction, so Persian next to English reads right.
function inline(text) {
  return esc(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function markdown(text) {
  const blocks = String(text || '').split(/```/);
  return blocks.map((block, i) => {
    if (i % 2) { const body = block.replace(/^[\w+-]*\n/, ''); return `<pre><code>${esc(body)}</code></pre>`; }
    return block.split(/\n{2,}/).map((para) => para.trim()).filter(Boolean).map((para) => {
      const lines = para.split('\n');
      if (lines.every((l) => /^\s*(?:[-*]|\d+\.) /.test(l))) return `<ul dir="auto">${lines.map((l) => `<li>${inline(l.replace(/^\s*(?:[-*]|\d+\.) /, ''))}</li>`).join('')}</ul>`;
      if (/^#{1,4} /.test(lines[0]) && lines.length === 1) return `<p dir="auto" class="md-h">${inline(lines[0].replace(/^#{1,4} /, ''))}</p>`;
      return `<p dir="auto">${lines.map((l) => (/^\s*(?:[-*]|\d+\.) /.test(l) ? `<span class="md-li">${inline(l.replace(/^\s*(?:[-*]|\d+\.) /, ''))}</span>` : inline(l))).join('<br>').replace(/<br>(<span class="md-li">)/g, '$1').replace(/(<\/span>)<br>/g, '$1')}</p>`;
    }).join('');
  }).join('');
}

const LOCALES = { en: 'en-GB', zh: 'zh-CN', es: 'es-ES', ar: 'ar', ru: 'ru-RU', fa: 'fa-IR' };
const when = (ms) => (ms ? new Date(ms).toLocaleString(LOCALES[window.SYC?.i18n?.lang] || [], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '');

let state = null;
let current = null; // the open session
let events = null; // EventSource of the open session
let engineChoice = 'auto';
let draft = null; // settings being edited
let live = null; // the answer being written right now

// ---- loading ----------------------------------------------------------------------

async function loadState() {
  const device = store.get('syc.device');
  try { state = await api(`/api/syc/state${device ? `?device=${encodeURIComponent(device)}` : ''}`); }
  catch (error) {
    document.querySelector('.aio-shell').innerHTML = `<section class="aio-empty"><img src="/assets/syc-logo.svg" alt="" width="64" height="64"><h1>${esc(t('SYC-AI All in One'))}</h1><p>${esc(t(error.message === 'hosted_only' ? 'This part runs on the SYC-AI panel at app.syc-ai.com, where your devices connect.' : 'Could not load. Please try again.'))}</p><p><a class="aio-send" href="/profage">${esc(t('Back'))}</a></p></section>`;
    return false;
  }
  renderDevices(); renderSessions(); renderEngines(); renderUsage(); updateHint();
  return true;
}

function renderDevices() {
  const select = $('deviceSelect');
  if (!state.devices.length) {
    select.innerHTML = `<option value="">${esc(t('No device connected'))}</option>`;
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = state.devices.map((d) => `<option value="${esc(d.deviceId)}"${d.deviceId === state.deviceId ? ' selected' : ''}>${esc(d.name)} · ${esc(d.platform)}</option>`).join('');
  select.onchange = () => { store.set('syc.device', select.value); loadState(); };
}

function renderEngines() {
  const chips = Object.entries(state.engines).map(([id, e]) => {
    const status = e.ready === true ? ['ok', t('ready')] : e.ready === false ? ['off', t('not signed in on this device')] : ['wait', t('checking…')];
    return `<span class="aio-chip ${status[0]}"><img src="${ENGINE_LOGO[id]}" alt="">${esc(e.name)} <small>${esc(status[1])}</small></span>`;
  }).join('');
  const soon = ['Gemini', 'Cursor', 'Kimi'].map((n) => `<span class="aio-chip soon">${esc(n)} <small>${esc(t('joins soon'))}</small></span>`).join('');
  $('engineChips').innerHTML = chips + soon + (Object.values(state.engines).some((e) => e.ready === false) ? `<a class="aio-link" href="/profage">${esc(t('Sign in an account on your device'))}</a>` : '');
  if (Object.values(state.engines).some((e) => e.ready === null)) setTimeout(() => loadState(), 4000);
}

function renderSessions() {
  const list = $('sessionList');
  if (!state.sessions.length) { list.innerHTML = `<p class="aio-note">${esc(t('No sessions yet.'))}</p>`; return; }
  list.innerHTML = state.sessions.map((s) => `
    <div class="aio-session${current?.id === s.id ? ' on' : ''}" data-id="${esc(s.id)}">
      <button type="button" class="aio-session-open"><b dir="auto">${esc(s.title)}</b><small>${s.running ? `<i class="aio-dot"></i>${esc(t('working…'))}` : esc(when(s.updatedAt))}${s.engines.map((e) => ` <img src="${ENGINE_LOGO[e] || ''}" alt="${esc(ENGINE_NAME[e] || e)}">`).join('')}</small></button>
      <button type="button" class="aio-session-del" title="Delete" aria-label="Delete" data-i18n-attr="title,aria-label">×</button>
    </div>`).join('');
  list.querySelectorAll('.aio-session').forEach((row) => {
    row.querySelector('.aio-session-open').onclick = () => { openSession(row.dataset.id); document.body.classList.remove('aio-side-open'); };
    row.querySelector('.aio-session-del').onclick = async () => {
      if (!confirm(t('Delete this session? The files in your project folder stay.'))) return;
      await api(`/api/syc/sessions/${row.dataset.id}/delete`, { method: 'POST', body: {} });
      if (current?.id === row.dataset.id) { current = null; showEmpty(); }
      loadState();
    };
  });
}

function renderUsage() {
  const cards = [];
  const bar = (label, w) => (w ? `<div class="aio-meter"><span>${esc(t(label))}</span><div class="aio-bar"><i data-used="${Math.min(100, Math.max(0, Number(w.used) || 0))}"></i></div><small>${w.used}% ${esc(t('used'))}${w.resetsAt ? ` · ${esc(t('resets'))} ${esc(when(w.resetsAt))}` : ''}</small></div>` : '');
  for (const [id, e] of Object.entries(state.engines)) {
    const slot = state.settings.accounts?.[id] || 1;
    const u = state.usage[slot === 2 ? `${id}-2` : id] || {};
    let body = '';
    if (id === 'claude') body = bar('5-hour window', u.fiveHour) + bar('Week', u.weekly);
    if (id === 'codex') body = bar('5-hour window', u.primary) + bar('Week', u.secondary);
    if (!body) body = `<p class="aio-note">${esc(t(e.ready ? 'Usage appears after the first answer.' : 'Not signed in on this device.'))}</p>`;
    const limited = u.limited ? `<p class="aio-limit">${esc(t('Limit reached'))}${u.limitedUntil ? ` · ${esc(t('resets'))} ${esc(when(u.limitedUntil))}` : ''}</p>` : '';
    cards.push(`<article class="aio-usage-card"><header><img src="${ENGINE_LOGO[id]}" alt=""><b>${esc(e.name)}</b>${slot === 2 ? `<small class="acc">${esc(t('2nd account'))}</small>` : ''}${u.plan ? `<small>${esc(u.plan)}</small>` : ''}</header>${limited}${body}</article>`);
  }
  $('usageCards').innerHTML = cards.join('');
  // The page's security policy allows no inline style attributes; widths go through the CSSOM.
  $('usageCards').querySelectorAll('.aio-bar i[data-used]').forEach((bar) => { bar.style.width = `${bar.dataset.used}%`; });
}

function updateHint() {
  const s = state?.settings;
  if (!s) return;
  const r = s.routes;
  $('routeHint').textContent = engineChoice !== 'auto'
    ? `${t('Every message goes to')} ${ENGINE_NAME[engineChoice]}`
    : s.routing === 'first' ? `${t('Every message goes to')} ${ENGINE_NAME[s.order[0]]}`
      : `${t('Planning')} → ${ENGINE_NAME[r.plan.engine]} · ${t('Building')} → ${ENGINE_NAME[r.build.engine]} · ${t('Short questions')} → ${ENGINE_NAME[r.quick.engine]}${r.quick.model !== 'default' ? ` ${t(MODEL_NAME[r.quick.model] || '')}` : ''}`;
}

// ---- the conversation ----------------------------------------------------------------

function showEmpty() {
  $('emptyState').classList.remove('hidden');
  $('thread').classList.add('hidden');
  $('sessionTitle').value = ''; $('sessionTitle').disabled = true;
  events?.close(); events = null;
}

function turnHtml(turn) {
  if (turn.role === 'user') return `<div class="aio-msg user" dir="auto">${markdown(turn.text)}</div>`;
  if (turn.role === 'system') return `<div class="aio-msg system">${esc(t(turn.text))}${turn.code === 'no_engine' ? ` <a class="aio-link" href="/profage">${esc(t('Open professional accounts'))}</a>` : ''}</div>`;
  const head = `<header class="aio-by"><img src="${ENGINE_LOGO[turn.engine] || ''}" alt=""><b>${esc(ENGINE_NAME[turn.engine] || turn.engine)}</b>${turn.model && turn.model !== 'default' ? `<small>${esc(t(MODEL_NAME[turn.model] || turn.model))}</small>` : ''}${turn.account === 2 ? `<small>${esc(t('2nd account'))}</small>` : ''}<small class="why">${esc(t(REASON[turn.reason] || ''))}</small></header>`;
  const tools = turn.tools?.length ? `<details class="aio-tools"><summary>${esc(t('Actions'))} (${turn.tools.length})</summary>${turn.tools.map((x) => `<div><b>${esc(x.name)}</b> <code>${esc(x.detail)}</code></div>`).join('')}</details>` : '';
  let tail = '';
  if (turn.quota) tail = `<div class="aio-quota">${esc(t('This subscription reached its usage limit'))}${turn.quota.resetsAt ? ` · ${esc(t('resets'))} ${esc(when(turn.quota.resetsAt))}` : ''}.</div>`;
  else if (turn.error) tail = `<div class="aio-quota err">${esc(t(turn.error === 'device_unavailable' ? 'Your device did not answer. Is SYC Node running and online?' : turn.error === 'device_paused' ? 'SYC Node is paused on this device (syc-node resume).' : turn.error))}</div>`;
  if (turn.stopped) tail += `<div class="aio-note">${esc(t('Stopped.'))}</div>`;
  const usage = turn.usage ? `<small class="aio-tokens">${esc(t('tokens'))}: ${esc(t('in'))} ${fmt(turn.usage.input)} · ${esc(t('cached'))} ${fmt(turn.usage.cached)} · ${esc(t('out'))} ${fmt(turn.usage.output)}</small>` : '';
  return `<div class="aio-msg bot engine-${esc(turn.engine)}">${head}${tools}<div class="aio-body" dir="auto">${markdown(turn.text) || (turn.quota || turn.error ? '' : `<span class="aio-note">${esc(t('(no text)'))}</span>`)}</div>${tail}${usage}</div>`;
}
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n || 0));

function renderThread() {
  const thread = $('thread');
  const lastQuota = [...current.turns].reverse().find((x) => x.role === 'assistant');
  let offer = '';
  if (lastQuota?.quota && !current.running) {
    const other = Object.keys(ENGINE_NAME).find((e) => e !== lastQuota.engine);
    offer = `<div class="aio-offer"><b>${esc(t('What next?'))}</b>
      <button type="button" data-retry="${esc(other)}">${esc(t('Continue with'))} ${esc(ENGINE_NAME[other])}</button>
      ${lastQuota.quota.resetsAt ? `<span class="aio-note">${esc(t('or wait until'))} ${esc(when(lastQuota.quota.resetsAt))}</span>` : ''}
      <span class="aio-note">${esc(t('Your own API key through SYC-API is coming to the hosted panel.'))}</span></div>`;
  }
  thread.innerHTML = current.turns.map(turnHtml).join('') + (live ? liveHtml() : '') + offer;
  thread.querySelectorAll('[data-retry]').forEach((b) => { b.onclick = () => { const lastUser = [...current.turns].reverse().find((x) => x.role === 'user'); if (lastUser) send(lastUser.text, b.dataset.retry); }; });
  thread.scrollTop = thread.scrollHeight;
}

function liveHtml() {
  return `<div class="aio-msg bot live engine-${esc(live.engine)}"><header class="aio-by"><img src="${ENGINE_LOGO[live.engine] || ''}" alt=""><b>${esc(ENGINE_NAME[live.engine] || '')}</b><small class="why">${esc(t(REASON[live.reason] || ''))}</small><i class="aio-dot"></i><small>${esc(t('working…'))}</small></header>
    ${live.tools.length ? `<div class="aio-tools open">${live.tools.slice(-4).map((x) => `<div><b>${esc(x.name)}</b> <code>${esc(x.detail)}</code></div>`).join('')}</div>` : ''}
    <div class="aio-body" dir="auto">${markdown(live.texts.join('\n\n'))}</div></div>`;
}

function setBusy(busy) {
  current.running = busy;
  $('sendBtn').classList.toggle('hidden', busy);
  $('stopBtn').classList.toggle('hidden', !busy);
}

async function openSession(id) {
  events?.close(); live = null;
  const { session, running } = await api(`/api/syc/sessions/${id}`);
  current = { ...session, running };
  $('emptyState').classList.add('hidden');
  $('thread').classList.remove('hidden');
  $('sessionTitle').disabled = false;
  $('sessionTitle').value = session.title;
  if (session.deviceId && state.devices.some((d) => d.deviceId === session.deviceId)) $('deviceSelect').value = session.deviceId;
  setBusy(running);
  renderThread(); renderSessions();
  events = new EventSource(`/api/syc/sessions/${id}/events`);
  events.addEventListener('route', (e) => { const d = JSON.parse(e.data); live = { engine: d.engine, reason: d.reason, texts: [], tools: [] }; setBusy(true); renderThread(); });
  events.addEventListener('text', (e) => { const d = JSON.parse(e.data); if (live) { live.texts.push(d.text); renderThread(); } });
  events.addEventListener('tool', (e) => { const d = JSON.parse(e.data); if (live) { live.tools.push(d); renderThread(); } });
  events.addEventListener('user', (e) => { const d = JSON.parse(e.data); if (!current.turns.some((x) => x.index === d.turn.index)) { current.turns.push(d.turn); renderThread(); } });
  events.addEventListener('turn', (e) => { const d = JSON.parse(e.data); live = null; if (!current.turns.some((x) => x.index === d.turn.index)) current.turns.push(d.turn); renderThread(); });
  events.addEventListener('switch', (e) => { const d = JSON.parse(e.data); current.turns.push({ index: -1, role: 'system', text: `${ENGINE_NAME[d.from]} ${t('reached its limit. Continuing the same message with')} ${ENGINE_NAME[d.to]}…` }); renderThread(); });
  events.addEventListener('usage', (e) => { const d = JSON.parse(e.data); state.usage[d.engine] = { ...(state.usage[d.engine] || {}), ...d.usage }; renderUsage(); });
  events.addEventListener('idle', async () => { live = null; setBusy(false); const fresh = await api(`/api/syc/sessions/${id}`); current = { ...fresh.session, running: false }; $('sessionTitle').value = current.title; renderThread(); loadState(); });
}

async function ensureSession(templateId) {
  const { session } = await api('/api/syc/sessions', { method: 'POST', body: { template: templateId || null, deviceId: $('deviceSelect').value || null } });
  await loadState();
  await openSession(session.id);
  return session;
}

async function send(text, engine = engineChoice) {
  const message = String(text || '').trim();
  if (!message) return;
  if (!state.devices.length) { alert(t('Connect a device first (Connection → Get SYC-AI).')); return; }
  if (!current) await ensureSession();
  $('messageInput').value = '';
  try {
    setBusy(true);
    await api(`/api/syc/sessions/${current.id}/send`, { method: 'POST', body: { text: message, engine, deviceId: $('deviceSelect').value } });
  } catch (error) {
    setBusy(false);
    $('messageInput').value = message;
    alert(t(error.message === 'busy' ? 'This session is still working. Wait for it or press Stop.' : error.message === 'no_device' ? 'Connect a device first (Connection → Get SYC-AI).' : error.message));
  }
}

// ---- settings -------------------------------------------------------------------------

function fillSettings() {
  const s = draft;
  $('orderList').innerHTML = s.order.map((id, i) => `<li><img src="${ENGINE_LOGO[id]}" alt=""><b>${esc(ENGINE_NAME[id])}</b><span class="aio-order-btns"><button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Up">↑</button><button type="button" data-down="${i}" ${i === s.order.length - 1 ? 'disabled' : ''} aria-label="Down">↓</button></span></li>`).join('')
    + ['Gemini', 'Cursor', 'Kimi'].map((n) => `<li class="soon"><b>${esc(n)}</b><small>${esc(t('joins soon'))}</small></li>`).join('');
  $('orderList').querySelectorAll('[data-up],[data-down]').forEach((b) => { b.onclick = () => { const i = Number(b.dataset.up ?? b.dataset.down); const j = b.dataset.up != null ? i - 1 : i + 1; [s.order[i], s.order[j]] = [s.order[j], s.order[i]]; fillSettings(); }; });
  $('routingAuto').checked = s.routing === 'auto';
  $('routeRows').innerHTML = Object.keys(TASK_NAME).map((task) => {
    const r = s.routes[task];
    const models = state.engines[r.engine]?.models || ['default'];
    return `<div class="aio-route"><span>${esc(t(TASK_NAME[task]))}</span>
      <select data-route-engine="${task}">${Object.keys(ENGINE_NAME).map((e) => `<option value="${e}"${e === r.engine ? ' selected' : ''}>${ENGINE_NAME[e]}</option>`).join('')}</select>
      <select data-route-model="${task}">${models.map((m) => `<option value="${m}"${m === r.model ? ' selected' : ''}>${esc(t(MODEL_NAME[m] || m))}</option>`).join('')}</select></div>`;
  }).join('');
  $('routeRows').querySelectorAll('[data-route-engine]').forEach((sel) => { sel.onchange = () => { s.routes[sel.dataset.routeEngine] = { engine: sel.value, model: 'default' }; fillSettings(); }; });
  $('routeRows').querySelectorAll('[data-route-model]').forEach((sel) => { sel.onchange = () => { s.routes[sel.dataset.routeModel].model = sel.value; }; });
  $('fallback').checked = s.fallback;
  seg('codexEffort', s.codexEffort, (v) => { s.codexEffort = v; });
  seg('accClaude', String(s.accounts.claude), (v) => { s.accounts.claude = Number(v); });
  seg('accCodex', String(s.accounts.codex), (v) => { s.accounts.codex = Number(v); });
  $('language').value = s.language;
  seg('style', s.style, (v) => { s.style = v; });
  $('planFirst').checked = s.planFirst; $('beginner').checked = s.beginner;
  $('project').value = s.project; $('projectEcho').textContent = s.project;
  $('memory').value = s.memory; $('rememberDecisions').checked = s.rememberDecisions;
  document.querySelectorAll('#permissions input').forEach((r) => { r.checked = r.value === s.permissions; });
  $('tokenSaver').checked = s.tokenSaver;
  const credit = state.skills.filter((k) => k.category === 'tokens' && !k.soon).map((k) => `<a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.name)}</a> (${esc(k.author)})`).join(` ${esc(t('and'))} `);
  $('tokenCredit').innerHTML = `${esc(t('For your convenience, SYC-AI uses the tools and skills'))} ${credit} ${esc(t('to cut token use — up to 65% fewer output tokens in their authors’ own tests. Thank you to their authors.'))}`;
  $('skillGrid').innerHTML = state.skills.map((k) => {
    const on = s.skills.includes(k.id);
    return `<article class="aio-skill${k.soon ? ' soon' : ''}"><span class="aio-skill-mark">${esc(k.name.slice(0, 1))}</span><div><b>${esc(k.name)}</b><small>${esc(t(k.blurb))}</small><small class="by">${esc(t('by'))} <a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.author)}</a> · ${esc(k.license)}</small></div>
      ${k.soon ? `<span class="aio-soon">${esc(t('Coming soon'))}</span>` : `<button type="button" class="aio-toggle${on ? ' on' : ''}" data-skill="${esc(k.id)}">${esc(t(on ? 'Installed' : 'Add'))}</button>`}</article>`;
  }).join('');
  $('skillGrid').querySelectorAll('[data-skill]').forEach((b) => { b.onclick = () => { const id = b.dataset.skill; s.skills = s.skills.includes(id) ? s.skills.filter((x) => x !== id) : [...s.skills, id]; fillSettings(); }; });
  $('connectorGrid').innerHTML = state.connectors.map((c) => `<article class="aio-skill soon"><span class="aio-skill-mark">${esc(c.name.slice(0, 1))}</span><div><b>${esc(c.name)}</b><small>${esc(t(c.blurb))}</small></div><span class="aio-soon">${esc(t('Coming soon'))}</span></article>`).join('');
}

function seg(id, value, onPick) {
  const box = $(id);
  box.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.value === value); b.onclick = () => { onPick(b.dataset.value); box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }; });
}

function readSettings() {
  const s = draft;
  s.routing = $('routingAuto').checked ? 'auto' : 'first';
  s.fallback = $('fallback').checked;
  s.language = $('language').value;
  s.planFirst = $('planFirst').checked; s.beginner = $('beginner').checked;
  s.project = $('project').value.trim().toLowerCase() || 'main';
  s.memory = $('memory').value; s.rememberDecisions = $('rememberDecisions').checked;
  s.permissions = document.querySelector('#permissions input:checked')?.value || 'edit';
  s.tokenSaver = $('tokenSaver').checked;
  return s;
}

function openLayer(id) { $(id).classList.remove('hidden'); document.body.classList.add('modal-open'); }
function closeLayers() { document.querySelectorAll('.aio-layer').forEach((l) => l.classList.add('hidden')); document.body.classList.remove('modal-open'); }

// ---- wiring --------------------------------------------------------------------------

(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login?next=/profage/syc/'; return; }
  window.SycProfile?.init(me.user);
  if (!(await loadState())) return;
  const wanted = new URLSearchParams(location.search).get('session');
  if (wanted && state.sessions.some((s) => s.id === wanted)) openSession(wanted);
  else if (state.sessions[0]) openSession(state.sessions[0].id);
  else showEmpty();

  $('composer').onsubmit = (e) => { e.preventDefault(); send($('messageInput').value); };
  $('messageInput').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send($('messageInput').value); } };
  $('stopBtn').onclick = () => current && api(`/api/syc/sessions/${current.id}/stop`, { method: 'POST', body: {} }).catch(() => {});
  document.querySelectorAll('.aio-engine-pick button').forEach((b) => {
    b.onclick = () => {
      engineChoice = b.dataset.engine;
      document.querySelectorAll('.aio-engine-pick button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      updateHint();
    };
  });
  $('newSession').onclick = async () => { current = null; await ensureSession(); $('messageInput').focus(); };
  $('sessionTitle').onchange = async () => { if (!current) return; await api(`/api/syc/sessions/${current.id}/rename`, { method: 'POST', body: { title: $('sessionTitle').value } }); loadState(); };
  $('toggleSide').onclick = () => document.body.classList.toggle('aio-side-open');
  $('openUsage').onclick = () => document.body.classList.toggle('aio-usage-open');
  $('refreshUsage').onclick = async () => {
    const button = $('refreshUsage'); button.disabled = true; button.textContent = t('Reading…');
    try { state.usage = (await api('/api/syc/usage/refresh', { method: 'POST', body: { deviceId: $('deviceSelect').value } })).usage; renderUsage(); }
    catch { /* device offline or Codex not signed in */ }
    button.disabled = false; button.textContent = t('Refresh Codex usage');
  };

  $('suggestBtn').onclick = async () => {
    const text = $('suggestText').value.trim();
    if (!text) return;
    const s = await api('/api/syc/suggest', { method: 'POST', body: { text } });
    const out = $('suggestOut');
    out.classList.remove('hidden');
    out.innerHTML = `${s.notes.map((n) => `<p>${esc(t(n))}</p>`).join('')}<p><b>${esc(t('Order'))}:</b> ${s.order.map((e) => ENGINE_NAME[e]).join(' → ')}</p><button type="button" id="applySuggest">${esc(t('Use this order'))}</button>`;
    $('applySuggest').onclick = async () => {
      const settings = await api('/api/syc/settings', { method: 'POST', body: { ...state.settings, order: s.order, routes: s.routes, tokenSaver: true, routing: 'auto' } });
      state.settings = settings.settings; updateHint();
      out.innerHTML = `<p>${esc(t('Saved. Your next message follows this order.'))}</p>`;
    };
  };

  $('newSpecial').onclick = () => {
    $('templateGrid').innerHTML = state.templates.map((tp) => `<article class="aio-template"><span class="aio-template-icon">${svg(tp.icon)}</span><b>${esc(t(tp.title))}</b><small>${esc(t(tp.blurb))}</small>
      <div class="aio-template-actions"><button type="button" data-start="${esc(tp.id)}">${esc(t('Start'))}</button><a href="/api/syc/templates/${esc(tp.id)}/download" download>${esc(t('Download'))}</a></div></article>`).join('');
    $('templateGrid').querySelectorAll('[data-start]').forEach((b) => {
      b.onclick = async () => {
        const tp = state.templates.find((x) => x.id === b.dataset.start);
        closeLayers(); current = null;
        await ensureSession(tp.id);
        $('messageInput').value = t(tp.starter); $('messageInput').focus();
      };
    });
    openLayer('specialLayer');
  };
  $('openSettings').onclick = () => { draft = JSON.parse(JSON.stringify(state.settings)); fillSettings(); openLayer('settingsLayer'); };
  document.querySelectorAll('.aio-tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.aio-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.aio-tab').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab));
    };
  });
  $('project').oninput = () => { $('projectEcho').textContent = $('project').value.trim().toLowerCase() || 'main'; };
  $('saveSettings').onclick = async () => {
    const status = $('settingsStatus');
    try {
      const saved = await api('/api/syc/settings', { method: 'POST', body: readSettings() });
      state.settings = saved.settings; updateHint();
      status.textContent = t('Saved. Your next message uses these settings.'); status.className = 'aio-note ok';
      setTimeout(closeLayers, 700);
    } catch (error) { status.textContent = error.message; status.className = 'aio-note err'; }
  };
  document.querySelectorAll('.aio-layer').forEach((layer) => {
    layer.onclick = (e) => { if (e.target === layer || e.target.hasAttribute('data-close')) closeLayers(); };
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayers(); });
})();
