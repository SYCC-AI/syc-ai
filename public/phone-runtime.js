// Inside the SYC-AI phone app only: Claude Code and Codex are set up on the
// phone itself (the app's RuntimeService). This card shows how far that got,
// and when the phone asks to join this account it approves the code by itself
// — the code comes from the app's own bridge, never from a link or the page.
(() => {
  const app = window.SYCApp;
  if (!app || typeof app.runtimeState !== 'function') return;
  const t = (text, vars) => (window.SYC?.t ? window.SYC.t(text, vars) : text);
  const STEPS = {
    download_linux: 'Downloading the private Linux…',
    unpack_linux: 'Unpacking…',
    download_node: 'Downloading Node.js…',
    unpack_node: 'Unpacking…',
    download_agent: 'Downloading SYC Node…',
    install_clis: 'Installing Claude Code and Codex — a few minutes…',
    link: 'Connecting this phone to your account…',
    error: 'Setup did not finish; trying again shortly.',
  };
  const DONE_KEY = 'syc.phoneRuntime.doneSeen';
  const host = document.querySelector('main') || document.body;
  const card = document.createElement('section');
  card.className = 'phone-runtime';
  card.hidden = true;
  card.innerHTML = '<div class="phone-runtime-head"><b></b><button type="button" aria-label="Close">×</button></div><p></p><div class="phone-runtime-bar"><i></i></div><button type="button" class="get-button phone-runtime-relink" hidden></button>';
  host.prepend(card);
  const [title, close] = [card.querySelector('b'), card.querySelector('button')];
  const [text, bar] = [card.querySelector('p'), card.querySelector('.phone-runtime-bar i')];
  const relink = card.querySelector('.phone-runtime-relink');
  const barBox = card.querySelector('.phone-runtime-bar');
  // App 1.3.4+: the account removed this phone; one tap asks to join again,
  // and the code it then shows is approved below like on first setup.
  relink.addEventListener('click', () => { relink.disabled = true; try { app.relinkRuntime(); } catch { relink.disabled = false; } });
  close.addEventListener('click', () => { card.hidden = true; try { localStorage.setItem(DONE_KEY, '1'); } catch { /* storage blocked */ } });

  let csrf = '';
  let approving = '';
  async function approve(code) {
    try {
      if (!csrf) csrf = (await fetch('/api/onboarding/bootstrap', { credentials: 'same-origin' }).then((r) => r.json()))?.data?.csrf?.csrfToken || '';
      await fetch('/api/onboarding/link/approve', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-syc-csrf': csrf },
        body: JSON.stringify({ code }),
      });
    } catch { approving = ''; /* the next tick tries again */ }
  }

  function tick() {
    let state = {};
    try { state = JSON.parse(app.runtimeState() || '{}'); } catch { state = {}; }
    if (!state.abi) { card.hidden = true; return; }
    if (state.code && state.code !== approving) { approving = state.code; approve(state.code); }
    let seen = false;
    try { seen = localStorage.getItem(DONE_KEY) === '1'; } catch { seen = false; }
    title.textContent = t('Claude and Codex on this phone');
    relink.hidden = true; barBox.hidden = false;
    if (state.step === 'removed') {
      text.textContent = t('This phone was removed from your SYC-AI account, so Claude and Codex on it cannot be used. Connect it again?');
      relink.textContent = t('Connect this phone again');
      relink.hidden = typeof app.relinkRuntime !== 'function';
      barBox.hidden = true;
      card.classList.remove('busy');
      card.hidden = false;
      // Above the welcome cards that other scripts put first: this one needs the owner.
      if (host.firstElementChild !== card) host.prepend(card);
      return;
    }
    relink.disabled = false;
    if (state.step === 'running') {
      text.textContent = t('Ready. Open Professional monthly accounts and press Sign in on Claude and Codex.');
      bar.style.width = '100%';
      card.hidden = seen;
      return;
    }
    if (!STEPS[state.step]) { card.hidden = true; return; }
    try { localStorage.removeItem(DONE_KEY); } catch { /* storage blocked */ }
    // The percentage in its own left-to-right run, so it stays "40%" in Persian and Arabic.
    const room = /^not_enough_space:(\d+)$/.exec(state.error || '');
    text.textContent = room && state.step === 'error'
      ? t('Not enough free space: SYC-AI needs about {mb} MB more on this phone. Setup goes on by itself once there is room.', { mb: room[1] })
      : t(STEPS[state.step]);
    if (state.percent >= 0) { const n = document.createElement('bdi'); n.dir = 'ltr'; n.textContent = ` ${state.percent}%`; text.append(' ', n); }
    bar.style.width = state.percent >= 0 ? `${state.percent}%` : '35%';
    card.classList.toggle('busy', state.percent < 0);
    card.hidden = false;
  }
  tick();
  setInterval(tick, 2000);
})();
