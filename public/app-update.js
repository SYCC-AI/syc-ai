// SYC-AI for Windows opens this panel from its shortcut
// (app.syc-ai.com/main?app=windows&v=<version>). The panel remembers that
// version and compares it with the published one (/app-versions.json, the same
// list the Android app reads): an optional update shows a bar with "Later",
// a required one covers the page until the new SYC-AI-Setup.exe is installed.
// The Android app checks for itself, so nothing is shown there.
(() => {
  const KEY = 'syc.windowsApp';
  const t = (s) => (window.SYC?.t ? window.SYC.t(s) : s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let mine = '';
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('app') === 'windows' && /^\d+\.\d+\.\d+$/.test(q.get('v') || '')) localStorage.setItem(KEY, q.get('v'));
    mine = localStorage.getItem(KEY) || '';
  } catch { mine = ''; }
  if (!mine || /SYC-AI-Android\//.test(navigator.userAgent)) return;
  // Once a day: this Windows app version is in use (console → App updates).
  // A random id for this browser, the version, nothing else.
  try {
    if (Date.now() - Number(localStorage.getItem(`${KEY}.reportAt`) || 0) > 86_400_000) {
      let id = localStorage.getItem(`${KEY}.installId`);
      if (!id) { id = crypto.randomUUID(); localStorage.setItem(`${KEY}.installId`, id); }
      localStorage.setItem(`${KEY}.reportAt`, String(Date.now()));
      fetch('/api/public/app/report', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'launch', app: 'windows', version: mine, installId: id, os: 'Windows' }),
      }).catch(() => {});
    }
  } catch { /* storage blocked: no report */ }
  const newer = (a, b) => {
    const x = a.split('.').map(Number); const y = b.split('.').map(Number);
    for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  };
  const snoozed = () => { try { return Number(sessionStorage.getItem(`${KEY}.later`) || 0) > Date.now(); } catch { return false; } };
  fetch('/app-versions.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((list) => {
    const w = list?.windows;
    if (!w || !newer(String(w.version || ''), mine) || !String(w.url || '').startsWith('https://syc-ai.com/')) return;
    if (!w.required && snoozed()) return;
    const box = document.createElement('div');
    box.className = w.required ? 'app-update app-update-required' : 'app-update';
    box.setAttribute('role', w.required ? 'alertdialog' : 'status');
    const title = w.required ? t('Update required') : t('Update available');
    const body = (w.required
      ? t('SYC-AI for Windows {v} is required to keep using SYC-AI. Download it and run it — it installs over this one and you stay signed in.')
      : t('SYC-AI for Windows {v} is ready. Download it and run it — it installs over this one and you stay signed in.')).replace('{v}', w.version);
    box.innerHTML = `<div class="app-update-card"><b>${esc(title)}</b><p>${esc(body)}</p>${w.notes ? `<small>${esc(w.notes)}</small>` : ''}
      <div class="app-update-actions"><a class="app-update-go" href="${esc(w.url)}">${esc(t('Download the update'))}</a>${w.required ? '' : `<button type="button" class="app-update-later">${esc(t('Later'))}</button>`}</div></div>`;
    box.querySelector('.app-update-later')?.addEventListener('click', () => {
      try { sessionStorage.setItem(`${KEY}.later`, String(Date.now() + 6 * 3600_000)); } catch { /* storage blocked */ }
      box.remove();
    });
    document.body.append(box);
  }).catch(() => {});
})();
