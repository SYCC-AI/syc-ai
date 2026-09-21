// Connection overview. Android is the section that works; Windows and Linux are
// dimmed until the panel is upgraded, and saying so on a click is friendlier
// than a card that silently does nothing.
(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login'; return; }
  window.SycProfile?.init(me.user);

  const state = document.getElementById('androidState');
  const phone = await fetch('/api/connection/android', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (state && phone) {
    const device = phone.device;
    const text = device ? `${device.name} · ${device.online ? 'Online' : 'Offline'}` : 'No phone connected';
    state.textContent = window.SYC?.t ? window.SYC.t(text) : text;
  }
})();

(() => {
  const toast = document.getElementById('toast');
  let timer = 0;
  const say = (text) => {
    toast.textContent = window.SYC?.t ? window.SYC.t(text) : text;
    toast.classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.add('hidden'), 2600);
  };
  document.querySelectorAll('[data-soon]').forEach((card) => {
    const tell = () => say('Not available yet.');
    card.addEventListener('click', tell);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tell(); }
    });
  });
})();
