(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login'; return; }
  window.SycProfile?.init(me.user);
  const tr = (x, vars) => (window.SYC?.t ? window.SYC.t(x, vars) : x);
  const hello = document.getElementById('helloLine');
  if (hello && me.user?.username) hello.textContent = tr('Welcome, {name}', { name: me.user.displayName || me.user.username });
  // "Get going" ticks itself: a device online, an account ready, phone alerts on.
  (async () => {
    const mark = (step) => document.querySelector(`.start-step[data-step="${step}"]`)?.classList.add('done');
    try {
      const hosted = await fetch('/api/hosted/accounts', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null));
      const devices = hosted?.devices || [];
      if (devices.length) mark('device');
      if (devices.some((d) => Object.values(d.accounts || {}).some((a) => a?.installed && a?.loggedIn))) mark('account');
    } catch { /* self-host install */ }
    try {
      const phone = await fetch('/api/connection/android', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null));
      if (phone?.device?.permissions?.alerts) mark('phone');
    } catch { /* no phone yet */ }
  })();
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
  // The first 1,000 members get a thank-you once, with a friendly (optional)
  // GitHub star link. Nothing depends on it; it can be closed for good.
  try {
    const t = (x) => (window.SYC?.t ? window.SYC.t(x) : x);
    const key = 'syc.thanks.v1';
    if (me.user?.earlyMember && !localStorage.getItem(key)) {
      const box = document.createElement('section');
      box.className = 'thanks-card';
      box.setAttribute('role', 'note');
      box.innerHTML = `<span class="thanks-hand" aria-hidden="true">👋</span>
        <div class="thanks-body">
          <strong>${t('Thank you for being one of our first 1,000 members')}</strong>
          <p>${t('We have opened valuable features to you for free. SYC-AI is at the start of its road — if you like it, a star on GitHub helps other people find it. We are not asking for stars; only if you really like it. Have a wonderful day.')}</p>
          <div class="thanks-actions">
            <a class="thanks-star" href="https://github.com/SYCC-AI/syc-ai" target="_blank" rel="noopener">★ ${t('Star SYC-AI on GitHub')}</a>
            <button type="button" class="thanks-later">${t('Maybe later')}</button>
          </div>
        </div>`;
      const done = () => { box.remove(); try { localStorage.setItem(key, String(Date.now())); } catch {} };
      box.querySelector('.thanks-later').onclick = done;
      box.querySelector('.thanks-star').addEventListener('click', () => setTimeout(done, 400));
      document.querySelector('.dash')?.prepend(box);
    }
  } catch { /* storage blocked */ }
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
