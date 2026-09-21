(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login'; return; }
  window.SycProfile?.init(me.user);
  if (me.access?.mode !== 'active') {
    const notice = document.createElement('section');
    notice.className = 'access-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<strong>Account access is restricted.</strong><span>Support and account recovery remain available from your profile.</span>';
    document.querySelector('.dash')?.prepend(notice);
    document.querySelectorAll('a.card').forEach((card) => {
      card.removeAttribute('href');
      card.setAttribute('aria-disabled', 'true');
      card.classList.add('locked');
    });
  }
})();
