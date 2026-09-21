// The Android page: install SYC Claw, then govern what the panel's agents are
// allowed to do on the one phone that signed in. Everything it shows comes from
// this panel; the phone signs in with this panel's own username and password, so
// an installation on someone else's server only ever talks to their phone.
const CAPABILITIES = [
  ['screen', 'Read the screen'],
  ['tap', 'Tap and swipe'],
  ['type', 'Type text'],
  ['apps', 'Open apps'],
  ['notifications', 'Read notifications'],
  ['files', 'Files'],
];

const t = (text) => (window.SYC?.t ? window.SYC.t(text) : text);
const el = (id) => document.getElementById(id);

let toastTimer = 0;
function say(text) {
  const toast = el('toast');
  toast.textContent = t(text);
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2800);
}

const api = async (path, options) => {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || t('Something went wrong.'));
  return body;
};

function renderApp(app) {
  if (!app?.available) {
    el('appBox').innerHTML = `<p class="muted">${t('The app is not published on this panel yet.')}</p>`;
    return;
  }
  el('appBox').innerHTML = `
    <a class="device-download" href="/connection/android/app.apk" download>
      <span class="card-icon"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></svg></span>
      <span>
        <b>${t('Download SYC Claw')}</b>
        <small>${t('Version')} ${app.version} · ${app.sizeMb} MB · Android ${app.minimumAndroid}+</small>
      </span>
    </a>
    <p class="device-hash"><span>SHA-256</span><code>${app.sha256 || '—'}</code></p>`;
}

function renderDevice(device) {
  const box = el('deviceBox');
  if (!device) {
    box.innerHTML = `<p class="muted">${t('No phone connected')}</p>`;
    return;
  }
  const rows = CAPABILITIES.map(([key, label]) => `
    <label class="device-perm">
      <input type="checkbox" data-perm="${key}"${device.permissions?.[key] ? ' checked' : ''}>
      <span>${t(label)}</span>
    </label>`).join('');
  const access = device.accessibility
    ? `<span class="device-dot on">${t('Access granted on the phone')}</span>`
    : `<span class="device-dot off">${t('Waiting for access on the phone')}</span>`;
  box.innerHTML = `
    <div class="device-known">
      <div>
        <b>${device.name}</b>
        <small class="muted">${device.model || ''} ${device.androidVersion ? `· Android ${device.androidVersion}` : ''}</small>
      </div>
      <span class="device-dot ${device.online ? 'on' : 'off'}">${device.online ? t('Online') : t('Offline')}</span>
    </div>
    <p class="device-access">${access}</p>
    <p class="muted">${t('What the panel’s agents may do on this phone. Everything is off until you turn it on. Ask the agents in your professional-account sessions to make changes on your phone.')}</p>
    <div class="device-perms">${rows}</div>
    <button class="ghost danger" type="button" id="revoke">${t('Disconnect this phone')}</button>`;

  box.querySelectorAll('[data-perm]').forEach((input) => {
    input.onchange = async () => {
      try {
        await api('/api/connection/android/permissions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: { [input.dataset.perm]: input.checked } }),
        });
        say('Saved.');
      } catch (error) {
        input.checked = !input.checked;
        say(error.message);
      }
    };
  });
  el('revoke').onclick = async () => {
    try { await api('/api/connection/android/revoke', { method: 'POST' }); say('The phone was disconnected.'); refresh(); }
    catch (error) { say(error.message); }
  };
}

async function refresh() {
  try {
    const status = await api('/api/connection/android');
    renderApp(status.app);
    renderDevice(status.device);
    window.SYC?.i18n?.apply?.();
  } catch (error) {
    say(error.message);
  }
}

(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login'; return; }
  window.SycProfile?.init(me.user);
  await refresh();
  // The phone may sign in or change state at any second; a slow poll notices it
  // and costs nothing.
  setInterval(refresh, 8000);
})();
