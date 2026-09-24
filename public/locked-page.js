// Pages whose features come with the paid editions: the button opens the
// Upgrade section of the profile.
(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
  window.SycProfile?.init(me.user);
  document.querySelectorAll('[data-open-upgrade]').forEach((button) => { button.onclick = () => window.SycProfile?.open('upgrade'); });
})();
