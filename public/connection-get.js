// Get SYC-AI: the four ways in (web, Android, Linux, desktop) with copyable
// install commands. On Chrome/Edge the page can also offer the desktop install.
const t = (text) => (window.SYC?.t ? window.SYC.t(text) : text);
let toastTimer = 0;
function say(text) {
  const toast = document.getElementById('toast');
  toast.textContent = t(text);
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2400);
}

// The installers speak the panel's language: /node/<lang>/… asks "English or <language>?".
{
  const lang = window.SYC?.i18n?.lang || 'en';
  if (lang !== 'en') {
    document.querySelectorAll('.get-command code').forEach((code) => {
      code.textContent = code.textContent.replace('https://syc-ai.com/node/install', `https://syc-ai.com/node/${lang}/install`);
    });
  }
}

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const text = button.parentElement.querySelector('code').textContent;
    try { await navigator.clipboard.writeText(text); say('Copied.'); } catch { say('Select the command and copy it.'); }
  });
});

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  document.getElementById('installApp').hidden = false;
});
document.getElementById('installApp').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  document.getElementById('installApp').hidden = true;
});

(async () => {
  const me = await fetch('/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!me?.user) { location.href = '/login'; return; }
  window.SycProfile?.init(me.user);
})();
