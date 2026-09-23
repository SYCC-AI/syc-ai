(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login'; return; }
  window.SycProfile?.init(me.user);
})();

// Engine settings open in a modal over this page, same as the main panel.
(() => {
  const layer = document.getElementById('engineSettingsLayer');
  const frame = document.getElementById('engineSettingsFrame');
  const close = () => {
    layer.classList.add('hidden');
    frame.src = 'about:blank';
    document.body.classList.remove('modal-open');
  };
  layer.querySelector('.engine-settings-close').onclick = close;
  layer.onclick = (e) => { if (e.target === layer) close(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !layer.classList.contains('hidden')) close(); });
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (e.data && ['syc:settings-close', 'syc:codex-settings-close'].includes(e.data.type)) close();
  });
  document.querySelectorAll('.card-gear').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('engineSettingsTitle').textContent = `${btn.dataset.label || ''} settings`.trim();
      frame.src = btn.dataset.settings;
      layer.classList.remove('hidden');
      document.body.classList.add('modal-open');
    };
  });
})();

// Professional accounts that are not installed yet (a "core" install) show an
// Install button that streams progress from the server as the account downloads
// and starts. Fully installed accounts keep their normal open link.
(async () => {
  const t = (s) => (window.SYC?.t ? window.SYC.t(s) : s);
  let status;
  try { status = await fetch('/api/panels/status', { credentials: 'same-origin' }).then((r) => r.json()); }
  catch { return; }
  if (!status?.installable) return; // full build or no package source: leave cards as links
  const byId = Object.fromEntries(status.panels.map((p) => [p.id, p]));
  document.querySelectorAll('.professional-card[data-brand]').forEach((card) => {
    const id = card.dataset.brand;
    const p = byId[id];
    if (!p || (p.installed && !p.updateAvailable)) return; // installed and current → normal link
    const link = card.querySelector('a.card');
    const footer = card.querySelector('.professional-card-footer');
    if (!link || !footer) return;
    const updating = Boolean(p.installed && p.updateAvailable);
    if (!updating) {
      link.addEventListener('click', (e) => e.preventDefault());
      link.setAttribute('aria-disabled', 'true');
    }
    // An installed account keeps its open link; the update sits beside it.
    footer.innerHTML = `${updating ? footer.innerHTML : ''}<button class="professional-open-label install-btn${updating ? ' update-btn' : ''}" type="button">${updating ? `${t('Update')} · ${p.update.version}` : t('Install')}</button>
      <div class="install-progress hidden"><div class="install-bar"><i></i></div><div class="install-step"></div></div>`;
    const btn = footer.querySelector('.install-btn');
    const prog = footer.querySelector('.install-progress');
    const bar = footer.querySelector('.install-bar > i');
    const step = footer.querySelector('.install-step');
    btn.onclick = () => {
      btn.classList.add('hidden');
      prog.classList.remove('hidden');
      card.classList.add('is-installing');
      step.textContent = t('starting…');
      const es = new EventSource(`/api/panels/install?id=${encodeURIComponent(id)}${updating ? '&update=1' : ''}`);
      es.addEventListener('step', (ev) => { const d = JSON.parse(ev.data); if (d.pct != null) bar.style.width = d.pct + '%'; step.textContent = t(d.text || 'working…'); });
      es.addEventListener('done', () => { bar.style.width = '100%'; step.textContent = t(updating ? 'Updated. Reloading…' : 'Installed. Reloading…'); es.close(); setTimeout(() => location.reload(), 900); });
      es.addEventListener('error', (ev) => {
        let msg = 'Install failed.'; try { msg = JSON.parse(ev.data).message || msg; } catch {}
        step.textContent = t(msg); step.classList.add('err'); card.classList.remove('is-installing');
        btn.classList.remove('hidden'); es.close();
      });
    };
  });
})();

// Hosted panel (syc-ai.com): professional accounts run on the customer's own
// device. Each card installs, signs in and opens the account on that device.
(async () => {
  const t = (s) => (window.SYC?.t ? window.SYC.t(s) : s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const get = (u) => fetch(u, { credentials: 'same-origin' }).then(async (r) => { const v = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(v.error || r.status), v); return v; });
  const post = (u, body) => fetch(u, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(async (r) => { const v = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(v.error || r.status), v); return v; });
  let state;
  try { state = await get('/api/hosted/accounts'); } catch { return; } // self-host install: nothing to do here
  document.body.classList.add('hosted-panel');
  const style = document.createElement('style');
  style.textContent = `.device-bar{margin:0 0 18px;padding:14px 16px;border-radius:14px;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.18)}
.device-bar h3{margin:0 0 6px;font-size:15px}.device-bar code{display:block;margin:6px 0;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.25);font-size:12px;overflow-x:auto;white-space:nowrap;user-select:all}
.device-bar select{margin-inline-start:8px}.hosted-actions{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center}#hostedFlow .hosted-actions{display:flex;width:100%}.hidden{display:none!important}
.hosted-actions button{cursor:pointer}.hosted-state{font-size:12px;opacity:.8;width:100%}.hosted-log{font-size:11px;max-height:90px;overflow:auto;white-space:pre-wrap;opacity:.7;width:100%;direction:ltr}
.hosted-login{width:100%;font-size:12px}.hosted-login a{word-break:break-all}.hosted-login input{width:100%;margin:6px 0}`;
  document.head.append(style);
  const HOSTED_APPS = Object.keys(state.apps || {});
  const bar = document.createElement('section');
  bar.className = 'device-bar';
  document.querySelector('main.dash').prepend(bar);
  let deviceId = (() => { try { return localStorage.getItem('syc.device') || ''; } catch { return ''; } })();

  // Accounts that do not run on devices yet stay visible but closed.
  document.querySelectorAll('.professional-card[data-brand]').forEach((card) => {
    if (HOSTED_APPS.includes(card.dataset.brand)) return;
    const link = card.querySelector('a.card');
    if (!link || link.classList.contains('disabled')) return;
    card.classList.add('is-pending'); link.classList.add('disabled'); link.setAttribute('aria-disabled', 'true'); link.removeAttribute('href');
    const footer = card.querySelector('.professional-card-footer');
    if (footer) footer.innerHTML = `<span class="professional-open-label">${esc(t('Coming soon'))}</span>`;
  });

  function renderBar() {
    const devices = state.devices || [];
    if (!devices.length) {
      bar.innerHTML = `<h3>${esc(t('Connect your device first'))}</h3>
        <div>${esc(t('Your professional accounts run on your own computer or server. Install SYC Node there and sign in with this SYC-AI account:'))}</div>
        <div>Linux / macOS:</div><code>curl -fsSL https://syc-ai.com/node/install.sh | bash</code>
        <div>Windows (PowerShell):</div><code>irm https://syc-ai.com/node/install.ps1 | iex</code>
        <div class="hosted-state">${esc(t('Waiting for your device…'))}</div>`;
      return;
    }
    if (!devices.some((d) => d.deviceId === deviceId)) deviceId = devices[0].deviceId;
    bar.innerHTML = `<h3>${esc(t('Your device'))}
      <select id="hostedDevice">${devices.map((d) => `<option value="${esc(d.deviceId)}" ${d.deviceId === deviceId ? 'selected' : ''}>${esc(d.name)} · ${esc(d.platform)}</option>`).join('')}</select></h3>
      <div class="hosted-state">${esc(t('Accounts are installed and signed in on this device. Your AI logins and files stay there.'))}</div>`;
    bar.querySelector('#hostedDevice').onchange = (e) => { deviceId = e.target.value; try { localStorage.setItem('syc.device', deviceId); } catch {} renderCards(); };
  }

  function renderCards() {
    const device = (state.devices || []).find((d) => d.deviceId === deviceId);
    for (const app of HOSTED_APPS) {
      const card = document.querySelector(`.professional-card[data-brand="${app}"]`);
      if (!card) continue;
      const link = card.querySelector('a.card');
      const footer = card.querySelector('.professional-card-footer');
      let box = footer.querySelector('.hosted-actions');
      if (!box) { box = document.createElement('span'); box.className = 'hosted-actions'; footer.prepend(box); }
      const sub = card.querySelector('a.card small');
      if (sub && !sub.dataset.base) sub.dataset.base = sub.textContent;
      const note = (text) => { if (sub) sub.textContent = text ? `${sub.dataset.base} · ${text}` : sub.dataset.base; };
      const st = device?.accounts?.[app];
      const ready = Boolean(st?.installed && st?.loggedIn);
      link.classList.toggle('disabled', !ready);
      if (ready) link.setAttribute('href', `/profage/${app}/`); else link.removeAttribute('href');
      if (!device) { box.innerHTML = ''; note(t('connect a device first')); continue; }
      if (!st || st.error) { box.innerHTML = ''; note(t('device not answering')); continue; }
      if (!st.installed) { box.innerHTML = `<button type="button" class="professional-open-label install-btn" data-do="install">${esc(t('Install'))}</button>`; note(t('not installed')); }
      else if (!st.loggedIn) { box.innerHTML = `<button type="button" class="professional-open-label install-btn" data-do="login">${esc(t('Sign in'))}</button>`; note(t('installed, not signed in')); }
      else { box.innerHTML = `<a class="professional-open-label" href="/profage/${app}/">${esc(t('Open'))}</a>`; note(t('ready')); }
      box.querySelector('[data-do="install"]')?.addEventListener('click', () => install(app, flowBox(app)));
      box.querySelector('[data-do="login"]')?.addEventListener('click', () => login(app, flowBox(app)));
    }
  }

  // Install logs and sign-in steps need room: they open in a panel under the device bar.
  const flow = document.createElement('section');
  flow.className = 'device-bar hidden'; flow.id = 'hostedFlow';
  bar.after(flow);
  function flowBox(app) {
    flow.classList.remove('hidden');
    flow.innerHTML = `<h3>${esc(state.apps?.[app]?.name || app)}</h3><div class="hosted-actions"></div>`;
    flow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return flow.querySelector('.hosted-actions');
  }

  async function refresh(fresh) {
    try { state = await get(`/api/hosted/accounts${fresh ? '?fresh=1' : ''}`); } catch { return; }
    renderBar(); renderCards();
  }

  async function install(app, box) {
    box.innerHTML = `<span class="hosted-state">${esc(t('Installing on your device… this can take a few minutes.'))}</span><div class="hosted-log"></div>`;
    const log = box.querySelector('.hosted-log');
    try {
      const r = await fetch(`/api/hosted/accounts/${app}/install`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId }) });
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; let failed = null;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1]; const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] || '{}');
          if (ev === 'log') { log.textContent = (log.textContent + data.text).slice(-3000); log.scrollTop = log.scrollHeight; }
          if (ev === 'fail') failed = data;
        }
      }
      if (failed) throw Object.assign(new Error(failed.error), failed);
    } catch (e) {
      const msg = e.message === 'npm_missing' ? t('Node.js/npm is missing on this device. Install Node.js 20+ from nodejs.org and try again.') : `${t('Install failed')}: ${e.message}`;
      box.innerHTML = `<button type="button" data-do="install">${esc(t('Try again'))}</button><span class="hosted-state">${esc(msg)}</span><div class="hosted-log">${esc(e.detail || '')}</div>`;
      box.querySelector('[data-do="install"]').onclick = () => install(app, box);
      return;
    }
    flow.classList.add('hidden');
    await refresh(true);
  }

  async function login(app, box) {
    box.innerHTML = `<span class="hosted-state">${esc(t('Opening sign-in on your device…'))}</span>`;
    let started;
    try { started = await post(`/api/hosted/accounts/${app}/login`, { deviceId }); }
    catch (e) { box.innerHTML = `<button type="button" data-do="login">${esc(t('Try again'))}</button><span class="hosted-state">${esc(e.message)}</span>`; box.querySelector('button').onclick = () => login(app, box); return; }
    if (started.needsCode) {
      box.innerHTML = `<div class="hosted-login">1. <a href="${esc(started.url)}" target="_blank" rel="noopener">${esc(t('Open the sign-in page'))}</a><br>2. ${esc(t('Paste the code it shows you:'))}
        <input type="text" autocomplete="off" spellcheck="false"><button type="button">${esc(t('Finish sign-in'))}</button><span class="hosted-state"></span></div>`;
      const input = box.querySelector('input'); const note = box.querySelector('.hosted-state');
      box.querySelector('button').onclick = async () => {
        note.textContent = t('Checking…');
        try { const r = await post(`/api/hosted/logins/${started.loginId}/code`, { code: input.value }); if (r.loggedIn) { flow.classList.add('hidden'); return refresh(true); } note.textContent = t('Not signed in yet. Check the code and try again.'); }
        catch (e) { note.textContent = e.message; }
      };
    } else {
      box.innerHTML = `<div class="hosted-login">1. <a href="${esc(started.url)}" target="_blank" rel="noopener">${esc(t('Open the sign-in page'))}</a><br>2. ${esc(t('Enter this code:'))} <b style="user-select:all">${esc(started.userCode || '')}</b><span class="hosted-state">${esc(t('Waiting for you to finish…'))}</span></div>`;
      for (let i = 0; i < 200; i += 1) {
        await new Promise((r) => setTimeout(r, 3000));
        const r = await get(`/api/hosted/logins/${started.loginId}`).catch(() => null);
        if (r?.done) { if (r.loggedIn) { flow.classList.add('hidden'); return refresh(true); } box.querySelector('.hosted-state').textContent = t('Sign-in did not finish. Try again.'); return; }
      }
    }
  }

  renderBar(); renderCards();
  // A device that is being set up appears on its own.
  setInterval(() => { if (!(state.devices || []).length) refresh(false); }, 10_000);
})();
