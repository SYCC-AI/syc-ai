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

const REQUEST_KIND = { notify: 'Notification', link: 'Link', text: 'Text' };
const REQUEST_STATUS = { pending: 'Waiting to reach the phone', delivered: 'On the phone, not tapped yet', opened: 'Opened', dismissed: 'Dismissed', expired: 'Expired' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Hosted (syc-ai.com): agents hand the phone a notification, a link or a piece
// of text, and each one waits there until the person taps it.
// What the user lets agents hand to the phone. All off until switched on; the
// risky one is red.
const HOSTED_CAPABILITIES = [
  ['alerts', 'Agent alerts', 'Your phone tells you when an agent is waiting for your OK, or when a long task has finished.', 'safe'],
  ['notify', 'Show notifications', 'Agents can put a message on the phone.', 'safe'],
  ['text', 'Send text to copy or share', 'Agents can hand you a piece of text; you copy or share it.', 'normal'],
  ['link', 'Send links to open', 'Links can lead to any website. Allow this only if you trust what your agents do.', 'danger'],
];

function hostedPermissionRows(permissions) {
  return HOSTED_CAPABILITIES.map(([key, label, hint, risk]) => `
    <label class="device-perm device-perm-${risk}">
      <input type="checkbox" data-perm="${key}"${permissions?.[key] ? ' checked' : ''}>
      <span><b>${t(label)}</b><small>${t(hint)}</small></span>
    </label>`).join('');
}

function hostedAgentsBlock(requests, permissions) {
  const rows = (requests || []).map((r) => `
    <li><b>${t(REQUEST_KIND[r.kind] || r.kind)}</b>${r.title ? ` · ${escapeHtml(r.title)}` : ''}
      <small class="muted">${t(REQUEST_STATUS[r.status] || r.status)} · ${new Date(r.createdAt).toLocaleString(window.SYC?.i18n?.lang || undefined)}</small></li>`).join('');
  return `
    <p class="muted">${t('Agents in your sessions can send this phone a notification, a link or a piece of text. Nothing opens until you tap it on the phone.')}</p>
    <h3 class="device-sub">${t('What agents may send to this phone')}</h3>
    <p class="muted">${t('Everything is off until you turn it on. Agents follow this setting, and the server refuses anything that is off.')}</p>
    <div class="device-perms device-perms-hosted">${hostedPermissionRows(permissions)}</div>
    <p class="muted">${t('Ask an agent, for example: “send this link to my phone”.')}</p>
    <h3 class="device-sub">${t('Recently sent to this phone')}</h3>
    ${rows ? `<ul class="device-requests">${rows}</ul>` : `<p class="muted">${t('Nothing has been sent yet.')}</p>`}`;
}

// Inside the SYC-AI Android app the page can link the phone it runs on: the
// app exposes a small bridge (SYCApp) on syc-ai.com pages only.
const appBridge = () => (window.SYCApp && typeof window.SYCApp.linkPhone === 'function' ? window.SYCApp : null);

async function connectThisPhone() {
  const bridge = appBridge();
  if (!bridge) return;
  say('Connecting…');
  try {
    const linked = await api('/api/connection/android/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bridge.deviceName(), androidVersion: bridge.androidVersion() }),
    });
    bridge.linkPhone(linked.token, linked.deviceId);
    say('This phone is now connected.');
    setTimeout(refresh, 2500);
  } catch (error) {
    say(t('Could not connect this phone.') + ' ' + error.message);
  }
}

function connectButton() {
  return appBridge() ? `<button class="get-button" type="button" id="connectPhone">${t('Connect this phone')}</button>` : '';
}

function renderDevice(device, hosted = false, requests = []) {
  const box = el('deviceBox');
  const bridge = appBridge();
  const thisPhone = Boolean(bridge && device && bridge.linkedDeviceId() === device.id);
  if (!device) {
    box.innerHTML = `<p class="muted">${t('No phone connected')}</p>${hosted ? connectButton() : ''}`;
    el('connectPhone')?.addEventListener('click', connectThisPhone);
    return;
  }
  const rows = CAPABILITIES.map(([key, label]) => `
    <label class="device-perm">
      <input type="checkbox" data-perm="${key}"${device.permissions?.[key] ? ' checked' : ''}>
      <span>${t(label)}</span>
    </label>`).join('');
  // The SYC-AI app needs no Accessibility; only the old SYC Claw reported it.
  const access = hosted && device.app ? '' : device.accessibility
    ? `<span class="device-dot on">${t('Access granted on the phone')}</span>`
    : `<span class="device-dot off">${t('Access is not on yet on the phone — follow step 3 above.')}</span>`;
  box.innerHTML = `
    <div class="device-known">
      <div>
        <b>${device.name}</b>
        <small class="muted">${device.model || ''} ${device.androidVersion ? `· Android ${device.androidVersion}` : ''}</small>
      </div>
      <span class="device-dot ${device.online ? 'on' : 'off'}">${device.online ? t('Online') : t('Offline')}</span>
    </div>
    ${access ? `<p class="device-access">${access}</p>` : ''}
    ${thisPhone ? `<p class="device-access"><span class="device-dot on">${t('This phone')}</span></p>` : (hosted && bridge ? `<p>${connectButton()}</p>` : '')}
    ${hosted ? hostedAgentsBlock(requests, device.permissions) : `
    <p class="muted">${t('What the panel’s agents may do on this phone. Everything is off until you turn it on. Ask the agents in your professional-account sessions to make changes on your phone.')}</p>
    <div class="device-perms">${rows}</div>`}
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
  el('connectPhone')?.addEventListener('click', connectThisPhone);
  el('revoke').onclick = async () => {
    try {
      await api('/api/connection/android/revoke', { method: 'POST' });
      if (thisPhone) bridge.unlinkPhone();
      say('The phone was disconnected.'); refresh();
    }
    catch (error) { say(error.message); }
  };
}

async function refresh() {
  try {
    const status = await api('/api/connection/android');
    if (status.hosted) {
      // Hosted: one app is both the panel and the phone connector.
      const [install, signin] = document.querySelectorAll('.device-card');
      install.innerHTML = `<h2>${t('1 · Install the SYC-AI app')}</h2>
        <p class="muted">${t('The SYC-AI app is this panel on your phone, and it also connects the phone to your account.')}</p>
        <p><a class="get-button" href="https://syc-ai.com/download/syc-ai.apk">${t('Download SYC-AI for Android')}</a></p>`;
      signin.innerHTML = `<h2>${t('2 · Connect the phone')}</h2>
        <p class="muted">${t('Open the SYC-AI app on the phone, sign in, go to Connection → Android and tap “Connect this phone”.')}</p>`;
      el('accessGuide').hidden = true;
    } else {
      renderApp(status.app);
      // Once access is on, the unlock steps are no longer needed.
      el('accessGuide').hidden = Boolean(status.device?.accessibility);
    }
    renderDevice(status.device, Boolean(status.hosted), status.requests);
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
