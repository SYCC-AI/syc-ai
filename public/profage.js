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
    if (!p || p.installed) return; // installed → normal link
    const link = card.querySelector('a.card');
    const footer = card.querySelector('.professional-card-footer');
    if (!link || !footer) return;
    link.addEventListener('click', (e) => e.preventDefault());
    link.setAttribute('aria-disabled', 'true');
    footer.innerHTML = `<button class="professional-open-label install-btn" type="button">${t('Install')}</button>
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
      const es = new EventSource(`/api/panels/install?id=${encodeURIComponent(id)}`);
      es.addEventListener('step', (ev) => { const d = JSON.parse(ev.data); if (d.pct != null) bar.style.width = d.pct + '%'; step.textContent = t(d.text || 'working…'); });
      es.addEventListener('done', () => { bar.style.width = '100%'; step.textContent = t('Installed. Reloading…'); es.close(); setTimeout(() => location.reload(), 900); });
      es.addEventListener('error', (ev) => {
        let msg = 'Install failed.'; try { msg = JSON.parse(ev.data).message || msg; } catch {}
        step.textContent = t(msg); step.classList.add('err'); card.classList.remove('is-installing');
        btn.classList.remove('hidden'); es.close();
      });
    };
  });
})();
