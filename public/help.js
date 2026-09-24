// The guide: signed-in users only (it shows the real panel); the table of
// contents follows the section in view.
(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login?next=/help'; return; }
  window.SycProfile?.init(me.user);
  try { localStorage.setItem('syc.guide.v1', String(Date.now())); } catch { /* storage blocked */ }
  const links = [...document.querySelectorAll('.help-toc a')];
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${entry.target.id}`));
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('.help-section[id]').forEach((section) => observer.observe(section));
})();
