// Connect a device that shows a code (SYC Node on a computer, the runtime in
// the phone app): the device never sees a password. The person checks the
// name and platform, presses Connect, and the device picks up its token.
(async () => {
  const t = (text, vars) => (window.SYC?.t ? window.SYC.t(text, vars) : text);
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
  window.SycProfile?.init(me.user);

  const input = document.getElementById('code');
  const button = document.getElementById('connect');
  const status = document.getElementById('status');
  const device = document.getElementById('device');
  const PLATFORM = { windows: 'Windows computer', linux: 'Linux computer', macos: 'Mac', android: 'Android phone' };
  const ICON = {
    windows: '<svg viewBox="0 0 24 24"><path d="M3 5.5 10.5 4.5v7H3zM12 4.3 21 3v8.5h-9zM3 12.5h7.5v7L3 18.5zM12 12.5h9V21l-9-1.3z"/></svg>',
    android: '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
  };
  const DEFAULT_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  const ERRORS = {
    link_expired: 'This code has expired or was already used. Start again on the device.',
    account_unavailable: 'Your account cannot connect devices right now. Please contact support.',
    rate_limited: 'Too many attempts. Wait a few minutes and try again.',
    device_limit_reached: 'You already have 10 devices. Disconnect one in Professional monthly accounts first.',
  };
  const explain = (code) => t(ERRORS[code] || 'Something went wrong. Try again.');

  let csrf = '';
  async function post(path, body) {
    if (!csrf) csrf = (await fetch('/api/onboarding/bootstrap', { credentials: 'same-origin' }).then((r) => r.json()))?.data?.csrf?.csrfToken || '';
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-syc-csrf': csrf }, body: JSON.stringify(body) });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || 'request_failed');
    return value.data;
  }
  const clean = (value) => {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  };

  async function look() {
    const code = clean(input.value);
    input.value = code;
    device.hidden = true; button.disabled = true; status.textContent = '';
    if (code.length !== 9) return;
    try {
      const found = await post('/api/onboarding/link/describe', { code });
      document.getElementById('deviceName').textContent = found.name;
      document.getElementById('devicePlatform').textContent = t(PLATFORM[found.platform] || found.platform);
      document.getElementById('deviceIcon').innerHTML = ICON[found.platform] || DEFAULT_ICON;
      device.hidden = false;
      button.disabled = found.status !== 'pending';
      if (found.status !== 'pending') status.textContent = t('This device is already connected.');
    } catch (error) { status.textContent = explain(error.message); }
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await post('/api/onboarding/link/approve', { code: clean(input.value) });
      status.textContent = t('Connected. The device finishes setting up by itself in a few seconds.');
      document.getElementById('next').hidden = false;
      input.disabled = true;
    } catch (error) { status.textContent = explain(error.message); button.disabled = false; }
  });
  input.addEventListener('input', () => { if (clean(input.value).length === 9) look(); else { device.hidden = true; button.disabled = true; } });
  const fromUrl = new URLSearchParams(location.search).get('code');
  // The code leaves the address bar once read, so it is not left in history.
  if (fromUrl) { input.value = clean(fromUrl); history.replaceState(null, '', '/link'); look(); }
  else input.focus();
})();
