(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login'; return; }
  window.SycProfile?.init(me.user);
  // Announcements from SYC-AI (welcome, maintenance…); each can be dismissed.
  try {
    const list = (await fetch('/api/onboarding/announcements', { credentials: 'same-origin' }).then((r) => r.json())).data || [];
    const seen = (() => { try { return JSON.parse(localStorage.getItem('syc.announce.seen') || '[]'); } catch { return []; } })();
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    for (const a of list.filter((x) => !seen.includes(x.id)).slice(0, 3).reverse()) {
      const box = document.createElement('section');
      box.className = 'access-notice announcement';
      box.setAttribute('role', 'status');
      box.innerHTML = `<strong>${esc(a.title)}</strong><span>${esc(a.body)}</span><button type="button" class="announce-close" aria-label="Close">×</button>`;
      box.querySelector('button').onclick = () => { box.remove(); try { localStorage.setItem('syc.announce.seen', JSON.stringify([...seen, a.id])); } catch {} };
      document.querySelector('.dash')?.prepend(box);
    }
  } catch { /* no announcements */ }
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
