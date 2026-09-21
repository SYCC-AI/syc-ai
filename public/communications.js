// Communications is a preview of what a panel upgrade adds: every card is
// dimmed and unclickable, and says so when someone tries.
(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login'; return; }
  window.SycProfile?.init(me.user);
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
