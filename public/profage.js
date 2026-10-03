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
  const err = (c) => (window.SYC?.err ? window.SYC.err(c) : c);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const get = (u) => fetch(u, { credentials: 'same-origin' }).then(async (r) => { const v = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(v.error || r.status), v); return v; });
  const post = (u, body) => fetch(u, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(async (r) => { const v = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(v.error || r.status), v); return v; });
  let state;
  try { state = await get('/api/hosted/accounts'); } catch { return; } // self-host install: nothing to do here
  document.body.classList.add('hosted-panel');
  const HOSTED_APPS = Object.keys(state.apps || {});
  const bar = document.createElement('section');
  bar.className = 'device-bar';
  (document.querySelector('.accounts-center') || document.querySelector('main.dash')).prepend(bar);
  let deviceId = (() => { try { return localStorage.getItem('syc.device') || ''; } catch { return ''; } })();

  // Accounts that do not run on devices yet stay visible but closed.
  // Only Claude and Codex have a panel here yet; other cards have no settings to open.
  document.querySelectorAll('.professional-card[data-brand]').forEach((card) => {
    if (!['claude', 'codex'].includes(card.dataset.brand)) card.querySelector('.card-gear')?.remove();
  });
  document.querySelectorAll('.professional-card[data-brand]').forEach((card) => {
    if (HOSTED_APPS.includes(card.dataset.brand) || card.dataset.brand === 'syc') return;
    const link = card.querySelector('a.card');
    if (!link || link.classList.contains('disabled')) return;
    card.classList.add('is-pending'); link.classList.add('disabled'); link.setAttribute('aria-disabled', 'true'); link.removeAttribute('href');
    const footer = card.querySelector('.professional-card-footer');
    if (footer) footer.innerHTML = `<span class="professional-open-label">${esc(t('Coming soon'))}</span>`;
  });

  const IN_APP = Boolean(window.SYCApp && typeof window.SYCApp.runtimeState === 'function');
  // "2 hours ago" in the page's language.
  const ago = (iso) => {
    const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
    const rtf = new Intl.RelativeTimeFormat(window.SYC?.i18n?.lang || 'en', { numeric: 'auto' });
    if (minutes > -60) return rtf.format(minutes, 'minute');
    if (minutes > -48 * 60) return rtf.format(Math.round(minutes / 60), 'hour');
    return rtf.format(Math.round(minutes / 1440), 'day');
  };
  function renderBar() {
    const devices = state.devices || [];
    const offline = state.offline || [];
    if (!devices.length && offline.length && !IN_APP) {
      // Set up before, switched off now: no need to install anything again.
      bar.hidden = false;
      bar.innerHTML = `<h3>${esc(t('Your device is offline'))}</h3>
        ${offline.map((d) => `<div class="hosted-offline"><b>${esc(d.name)}</b> · ${esc(d.platform)} · ${esc(t('last seen {when}', { when: ago(d.lastSeenAt) }))}</div>`).join('')}
        <div>${esc(t('Turn it on and sign in to it: SYC-AI starts there by itself and this page connects in a few seconds. Nothing to install again.'))}</div>
        <div class="hosted-state">${esc(t('Waiting for your device…'))}</div>`;
      return;
    }
    if (!devices.length) {
      // The installer speaks the panel's language (English stays at /node/).
      const lang = window.SYC?.i18n?.lang || 'en';
      const base = `https://syc-ai.com/node/${lang === 'en' ? '' : `${lang}/`}`;
      // Inside the phone app, the phone itself becomes the device (phone-runtime.js).
      // The progress card (phone-runtime.js) already says how far setup got,
      // so the bar stays empty inside the app.
      if (IN_APP) { bar.innerHTML = ''; bar.hidden = true; return; }
      bar.innerHTML = `<h3>${esc(t('Connect your device first'))}</h3>
        <div>${esc(t('Your professional accounts run on your own computer or server. Claude Code and Codex come with SYC-AI; a code appears on the computer, and you approve it here.'))}</div>
        <p><a class="get-button" href="https://syc-ai.com/download/SYC-AI-Setup.exe">${esc(t('Download SYC-AI for Windows'))}</a></p>
        <div>${esc(t('Windows, from PowerShell instead:'))}</div><code>irm ${base}install.ps1 | iex</code>
        <div class="hosted-state">${esc(t('Node.js is installed for you if it is missing. Remove it any time with: syc-node uninstall'))}</div>
        <div class="hosted-state">${esc(t('Waiting for your device…'))}</div>`;
      return;
    }
    bar.hidden = false;
    if (!devices.some((d) => d.deviceId === deviceId)) deviceId = devices[0].deviceId;
    bar.innerHTML = `<h3>${esc(t('Your device'))}
      <select id="hostedDevice">${devices.map((d) => `<option value="${esc(d.deviceId)}" ${d.deviceId === deviceId ? 'selected' : ''}>${esc(d.name)} · ${esc(d.platform)}</option>`).join('')}${offline.map((d) => `<option disabled>${esc(d.name)} · ${esc(t('offline'))}</option>`).join('')}</select></h3>
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
      const meta = state.apps?.[app] || {};
      const ready = Boolean(st?.installed && st?.loggedIn);
      // Gemini, Cursor and Kimi sign in here; their chat panel comes later.
      const opens = ready && meta.panel;
      link.classList.toggle('disabled', !opens);
      if (opens) link.setAttribute('href', `/profage/${app}/`); else link.removeAttribute('href');
      if (!device) { box.innerHTML = ''; note(t(IN_APP ? 'ready when this phone finishes setting up' : 'connect a device first')); continue; }
      if (st?.checking) { box.innerHTML = ''; note(t('checking…')); continue; }
      if (!st || st.error) { box.innerHTML = ''; note(t('device not answering')); continue; }
      if (!st.installed) { box.innerHTML = `<button type="button" class="professional-open-label install-btn" data-do="install">${esc(t('Install'))}</button>`; note(t('not installed')); }
      else if (st.installOnly) { box.innerHTML = ''; note(t('installed · sign-in coming soon')); }
      else if (!st.loggedIn) {
        box.innerHTML = meta.signIn === 'api-key'
          ? `<button type="button" class="professional-open-label install-btn" data-do="apikey">${esc(t('Add API key'))}</button>`
          : `<button type="button" class="professional-open-label install-btn" data-do="login">${esc(t('Sign in'))}</button>`;
        note(t('installed, not signed in'));
      } else if (meta.panel) { box.innerHTML = `<a class="professional-open-label open-link" href="/profage/${app}/">${esc(t('Open'))}</a>`; note(st.account?.email ? `${t('ready')} · ${st.account.email}` : st.account?.method === 'api-key' ? `${t('ready')} · ${t('API key')}` : t('ready')); }
      else {
        box.innerHTML = meta.signOut ? `<button type="button" class="professional-open-label install-btn" data-do="logout">${esc(t('Sign out'))}</button>` : '';
        note(st.method === 'api-key' ? t('API key saved on your device · chat panel coming soon') : t('signed in · chat panel coming soon'));
      }
      box.querySelector('[data-do="install"]')?.addEventListener('click', () => install(app, flowBox(app)));
      box.querySelector('[data-do="login"]')?.addEventListener('click', () => (meta.regions ? chooseRegion(app, flowBox(app)) : login(app, flowBox(app))));
      box.querySelector('[data-do="apikey"]')?.addEventListener('click', () => apiKey(app, flowBox(app)));
      box.querySelector('[data-do="logout"]')?.addEventListener('click', () => signOut(app, flowBox(app)));
      // A second account (personal and work, say): signed in on the same device,
      // chosen per session in SYC-AI. Never switched to automatically.
      card.querySelector('.second-account')?.remove();
      const second = device?.accounts?.[`${app}-2`];
      if (ready && second && ['claude', 'codex'].includes(app)) {
        const row = document.createElement('div');
        row.className = 'second-account';
        if (second.needsNodeUpdate) row.innerHTML = `<span>${esc(t('Second account'))}</span><small>${esc(t('needs SYC Node 0.7.1 — run: syc-node update'))}</small>`;
        else if (second.checking) row.innerHTML = `<span>${esc(t('Second account'))}</span><small>${esc(t('checking…'))}</small>`;
        else if (second.loggedIn) row.innerHTML = `<span>${esc(t('Second account'))}</span><small class="ok">${esc(t('signed in · choose it in SYC-AI settings'))}</small>`;
        else row.innerHTML = `<span>${esc(t('Second account'))}</span><button type="button" data-do="login2">${esc(t('Sign in a second account'))}</button>`;
        row.querySelector('[data-do="login2"]')?.addEventListener('click', () => login(`${app}-2`, flowBox(app)));
        card.append(row);
      }
    }
  }

  // Install logs and sign-in steps need room: they open in a panel under the device bar.
  const flow = document.createElement('section');
  flow.className = 'device-bar hidden'; flow.id = 'hostedFlow';
  bar.after(flow);
  function flowBox(app) {
    flow.classList.remove('hidden');
    flow.innerHTML = `<h3>${esc(state.apps?.[app.replace(/-2$/, '')]?.name || app)}</h3><div class="hosted-actions"></div>`;
    flow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return flow.querySelector('.hosted-actions');
  }

  let recheck = null;
  async function refresh(fresh) {
    try { state = await get(`/api/hosted/accounts${fresh ? '?fresh=1' : ''}`); } catch { return; }
    renderBar(); renderCards(); scheduleRecheck();
  }
  function scheduleRecheck() {
    const pending = (state.devices || []).some((d) => Object.values(d.accounts || {}).some((a) => a?.checking));
    clearTimeout(recheck);
    if (pending) recheck = setTimeout(() => refresh(false), 3000);
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
      const msg = e.message === 'npm_missing' ? t('Node.js/npm is missing on this device. Run the SYC Node installer again — it installs Node.js for you.') : e.message === 'not_available_on_this_platform' ? t('Not available for this device yet (Linux and macOS only).') : `${t('Install failed')}: ${err(e.message)}`;
      box.innerHTML = `<button type="button" data-do="install">${esc(t('Try again'))}</button><span class="hosted-state">${esc(msg)}</span><div class="hosted-log">${esc(e.detail || '')}</div>`;
      box.querySelector('[data-do="install"]').onclick = () => install(app, box);
      return;
    }
    flow.classList.add('hidden');
    await refresh(true);
  }

  // Kimi has two separate account systems: kimi.ai (international) and kimi.com (China).
  function chooseRegion(app, box) {
    box.innerHTML = `<div class="hosted-login">${esc(t('Where is your Kimi account?'))}<br>
      <button type="button" data-region="global">${esc(t('kimi.ai (international)'))}</button>
      <button type="button" data-region="mainland-cn">${esc(t('kimi.com (China)'))}</button></div>`;
    box.querySelectorAll('[data-region]').forEach((b) => { b.onclick = () => login(app, box, b.dataset.region); });
  }

  // Gemini: the key is sent once to the device and saved there (~/.syc-node/.env).
  function apiKey(app, box) {
    const url = state.apps?.[app]?.keyUrl || '';
    box.innerHTML = `<div class="signin-card">
      <p class="signin-lead">${esc(t('Gemini CLI signs in with a Gemini API key (Google no longer offers Gemini CLI sign-in for free and Google One accounts).'))}</p>
      <ol class="signin-steps"><li>${esc(t('Create a key in Google AI Studio'))}</li><li>${esc(t('Copy the key, paste it below and press Continue.'))}</li></ol>
      ${linkBlock(url)}
      <div class="signin-paste"><input type="password" autocomplete="off" spellcheck="false" dir="ltr" placeholder="AQ.… / AIza…"><button type="button" class="signin-copy" data-paste>${esc(t('Paste'))}</button></div>
      <button type="button" class="signin-primary signin-continue" disabled>${esc(t('Continue'))}</button>
      <span class="hosted-state">${esc(t('The key is saved only on your device, in ~/.syc-node/.env. SYC-AI does not keep it.'))}</span></div>`;
    wireLink(box, url);
    const input = box.querySelector('.signin-paste input'); const go = box.querySelector('.signin-continue'); const note = box.querySelector('.hosted-state');
    const check = () => { const ok = /^[A-Za-z0-9._-]{20,200}$/.test(input.value.trim()); go.disabled = !ok; input.classList.toggle('ok', ok); };
    input.addEventListener('input', check);
    box.querySelector('[data-paste]').onclick = async () => { try { input.value = (await navigator.clipboard.readText()).trim(); check(); } catch { input.focus(); note.textContent = t('Press and hold in the box, then choose Paste.'); } };
    go.onclick = async () => {
      go.disabled = true; note.textContent = t('Checking…');
      try { const r = await post(`/api/hosted/accounts/${app}/api-key`, { deviceId, key: input.value.trim() }); input.value = ''; if (r.loggedIn) return signedIn(app, { status: r }); note.textContent = t('Not saved. Try again.'); go.disabled = false; }
      catch (e) { note.textContent = e.message === 'api_key_rejected' ? t('Google did not accept this key. Copy it again.') : e.message === 'invalid_api_key' ? t('This does not look like an API key. Copy it again, without spaces.') : err(e.message); go.disabled = false; }
    };
  }

  async function signOut(app, box) {
    const name = state.apps?.[app]?.name || app;
    if (!window.confirm(t('Sign out of {name} on this device?').replace('{name}', name))) { flow.classList.add('hidden'); return; }
    box.innerHTML = `<span class="hosted-state">${esc(t('Signing out on your device…'))}</span>`;
    try { await post(`/api/hosted/accounts/${app}/logout`, { deviceId }); flow.classList.add('hidden'); return refresh(true); }
    catch (e) { box.innerHTML = `<button type="button">${esc(t('Try again'))}</button><span class="hosted-state">${esc(err(e.message))}</span>`; box.querySelector('button').onclick = () => signOut(app, box); }
  }

  // ---- sign-in window -------------------------------------------------------
  // The link is never shown bare: a box with the start of it, Copy beside it,
  // then "Open in browser" and "Copy link", and the steps in plain words.
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* WebView without clipboard access */ }
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.append(area); area.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove(); return ok;
  }
  function flash(button, text) {
    const old = button.dataset.label || button.textContent; button.dataset.label = old;
    button.textContent = text; button.classList.add('done');
    setTimeout(() => { button.textContent = old; button.classList.remove('done'); }, 1600);
  }
  function linkBlock(url) {
    const shown = url.replace(/^https?:\/\//, '');
    return `<div class="signin-link"><span class="signin-url" dir="ltr" title="${esc(url)}">${esc(shown)}</span>
        <button type="button" class="signin-copy" data-copy-link aria-label="${esc(t('Copy link'))}">${esc(t('Copy'))}</button></div>
      <div class="signin-buttons">
        <a class="signin-primary" href="${esc(url)}" target="_blank" rel="noopener">${esc(t('Open in browser'))}</a>
        <button type="button" class="signin-secondary" data-copy-link>${esc(t('Copy link'))}</button>
      </div>`;
  }
  function wireLink(box, url) {
    box.querySelectorAll('[data-copy-link]').forEach((b) => { b.onclick = async () => flash(b, (await copyText(url)) ? t('Copied') : t('Select and copy it by hand')); });
  }
  function signedIn(app, r) {
    const who = r?.status?.account?.email;
    const name = state.apps?.[app.replace(/-2$/, '')]?.name || app;
    flow.innerHTML = `<div class="signin-card signin-done"><b>✓ ${esc(t('{name} is signed in').replace('{name}', name))}</b>${who ? `<span dir="ltr">${esc(who)}</span>` : ''}</div>`;
    setTimeout(() => flow.classList.add('hidden'), 4000);
    return refresh(true);
  }
  const CLAUDE_CODE_RE = /^[A-Za-z0-9_-]{20,}#[A-Za-z0-9_-]{20,}$/;

  async function login(app, box, region) {
    const base = app.replace(/-2$/, '');
    // Codex has two official ways in: the ChatGPT plan, or an OpenAI API key.
    if (base === 'codex' && !box.dataset.way) {
      box.innerHTML = `<div class="signin-card"><p class="signin-lead">${esc(t('How do you want to sign in to Codex?'))}</p>
        <button type="button" class="signin-way" data-way="chatgpt"><b>${esc(t('ChatGPT account'))}</b><small>${esc(t('Plus, Pro, Business or Enterprise: uses your ChatGPT plan. Recommended.'))}</small></button>
        ${state.apps?.codex?.keyLogin ? `<button type="button" class="signin-way" data-way="api-key"><b>${esc(t('OpenAI API key'))}</b><small>${esc(t('Pay per use from your OpenAI platform account.'))}</small></button>` : ''}</div>`;
      box.querySelectorAll('[data-way]').forEach((b) => { b.onclick = () => { box.dataset.way = b.dataset.way; if (b.dataset.way === 'api-key') codexKey(app, box); else login(app, box, region); }; });
      return;
    }
    delete box.dataset.way;
    box.innerHTML = `<div class="signin-card"><span class="hosted-state">${esc(t('Opening sign-in on your device…'))}</span></div>`;
    let started;
    try { started = await post(`/api/hosted/accounts/${app}/login`, { deviceId, ...(region ? { region } : {}) }); }
    catch (e) { box.innerHTML = `<div class="signin-card"><span class="hosted-state">${esc(err(e.message))}</span><button type="button" class="signin-secondary" data-do="login">${esc(t('Try again'))}</button></div>`; box.querySelector('button').onclick = () => login(app, box, region); return; }
    const name = state.apps?.[base]?.name || app;
    if (started.needsCode) {
      // Claude: sign in on claude.ai, it shows a code, paste it back here.
      box.innerHTML = `<div class="signin-card">
        <ol class="signin-steps">
          <li>${esc(t('Open the sign-in page and sign in with your {name} account.').replace('{name}', name))}</li>
          <li>${esc(t('Press Authorize. The page then shows a code: copy it.'))}</li>
          <li>${esc(t('Paste the code below and press Continue.'))}</li>
        </ol>
        ${linkBlock(started.url)}
        <div class="signin-paste"><input type="text" autocomplete="off" spellcheck="false" autocapitalize="off" dir="ltr" placeholder="${esc(t('Paste the code here'))}">
          <button type="button" class="signin-copy" data-paste>${esc(t('Paste'))}</button></div>
        <button type="button" class="signin-primary signin-continue" disabled>${esc(t('Continue'))}</button>
        <span class="hosted-state"></span></div>`;
      wireLink(box, started.url);
      const input = box.querySelector('.signin-paste input'); const go = box.querySelector('.signin-continue'); const note = box.querySelector('.hosted-state');
      const check = () => { const v = input.value.trim(); const ok = CLAUDE_CODE_RE.test(v); go.disabled = !ok; input.classList.toggle('ok', ok); input.classList.toggle('bad', Boolean(v) && !ok); note.textContent = v && !ok ? t('This is not the whole code yet. Copy it again from the sign-in page.') : ''; };
      input.addEventListener('input', check);
      const paste = box.querySelector('[data-paste]');
      paste.onclick = async () => { try { input.value = (await navigator.clipboard.readText()).trim(); check(); } catch { input.focus(); note.textContent = t('Press and hold in the box, then choose Paste.'); } };
      go.onclick = async () => {
        go.disabled = true; note.textContent = t('Checking…');
        try { const r = await post(`/api/hosted/logins/${started.loginId}/code`, { code: input.value.trim() }); if (r.loggedIn) return signedIn(app, r); note.textContent = t('Not signed in yet. Check the code and try again.'); go.disabled = false; }
        catch (e) { note.textContent = err(e.message); go.disabled = false; }
      };
      return;
    }
    // Codex, Kimi (a code to type on their page) and Cursor (just sign in there).
    const steps = started.userCode
      ? [t('Open the sign-in page and sign in with your {name} account.').replace('{name}', name), t('When it asks for a code, enter the code below.'), t('Come back here. This page finishes by itself.')]
      : [t('Open the sign-in page and sign in with your {name} account.').replace('{name}', name), t('Come back here. This page finishes by itself.')];
    box.innerHTML = `<div class="signin-card">
      <ol class="signin-steps">${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${started.userCode ? `<div class="signin-code"><b dir="ltr">${esc(started.userCode)}</b><button type="button" class="signin-copy" data-copy-code>${esc(t('Copy'))}</button></div>` : ''}
      ${linkBlock(started.url)}
      <span class="hosted-state signin-wait">${esc(t('Waiting for you to finish…'))}</span></div>`;
    wireLink(box, started.url);
    box.querySelector('[data-copy-code]')?.addEventListener('click', async (ev) => flash(ev.currentTarget, (await copyText(started.userCode)) ? t('Copied') : t('Select and copy it by hand')));
    for (let i = 0; i < 200; i += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      if (!box.isConnected) return;
      const r = await get(`/api/hosted/logins/${started.loginId}`).catch(() => null);
      if (r?.done) { if (r.loggedIn) return signedIn(app, r); box.querySelector('.signin-wait').textContent = t('Sign-in did not finish. Try again.'); return; }
    }
  }

  // Codex with an OpenAI API key: sent once to the device's own `codex login`.
  function codexKey(app, box) {
    const url = state.apps?.codex?.keyLogin || 'https://platform.openai.com/api-keys';
    box.innerHTML = `<div class="signin-card">
      <ol class="signin-steps"><li>${esc(t('Open the OpenAI API keys page and create a key.'))}</li><li>${esc(t('Copy the key, paste it below and press Continue.'))}</li></ol>
      ${linkBlock(url)}
      <div class="signin-paste"><input type="password" autocomplete="off" spellcheck="false" dir="ltr" placeholder="sk-…"><button type="button" class="signin-copy" data-paste>${esc(t('Paste'))}</button></div>
      <button type="button" class="signin-primary signin-continue" disabled>${esc(t('Continue'))}</button>
      <span class="hosted-state">${esc(t('The key goes only to your device. SYC-AI does not keep it.'))}</span></div>`;
    wireLink(box, url);
    const input = box.querySelector('.signin-paste input'); const go = box.querySelector('.signin-continue'); const note = box.querySelector('.hosted-state');
    const check = () => { const ok = /^sk-[A-Za-z0-9._-]{16,}$/.test(input.value.trim()); go.disabled = !ok; input.classList.toggle('ok', ok); };
    input.addEventListener('input', check);
    box.querySelector('[data-paste]').onclick = async () => { try { input.value = (await navigator.clipboard.readText()).trim(); check(); } catch { input.focus(); note.textContent = t('Press and hold in the box, then choose Paste.'); } };
    go.onclick = async () => {
      go.disabled = true; note.textContent = t('Checking…');
      try { const r = await post(`/api/hosted/accounts/${app}/api-key`, { deviceId, key: input.value.trim() }); input.value = ''; if (r.loggedIn) return signedIn(app, { status: r }); note.textContent = t('Not signed in yet. Check the key and try again.'); go.disabled = false; }
      catch (e) { note.textContent = e.message === 'api_key_rejected' ? t('OpenAI did not accept this key. Copy it again.') : e.message === 'invalid_api_key' ? t('This does not look like an API key. Copy it again, without spaces.') : err(e.message); go.disabled = false; }
    };
  }

  renderBar(); renderCards(); scheduleRecheck();
  // A device that is being set up appears on its own.
  setInterval(() => { if (!(state.devices || []).length) refresh(false); }, 10_000);
})();

// "Coming to SYC-AI": each box says plainly that it is not open yet. Opening a
// box is counted (per box, nothing about the person) so the most wanted one is
// built first.
(() => {
  const t = (s) => (window.SYC?.t ? window.SYC.t(s) : s);
  const toast = document.getElementById('ideaToast');
  let timer = null;
  document.querySelectorAll('.idea-box[data-idea]').forEach((box) => {
    box.addEventListener('click', () => {
      fetch(`/api/syc/ideas/${encodeURIComponent(box.dataset.idea)}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
      const title = box.querySelector('b')?.textContent || '';
      toast.innerHTML = `<b></b><span></span>`;
      toast.querySelector('b').textContent = title;
      toast.querySelector('span').textContent = t('Not available yet — we are building it. Thank you: your interest helps us decide what comes first.');
      toast.classList.remove('hidden');
      clearTimeout(timer);
      timer = setTimeout(() => toast.classList.add('hidden'), 5000);
    });
  });
})();
