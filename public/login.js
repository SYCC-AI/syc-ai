import { createOnboardingState } from './onboarding-state.mjs';

const flow = createOnboardingState();
const t = (text, vars) => (window.SYC?.t ? window.SYC.t(text, vars) : text);
// Server error codes → a sentence the customer can act on (then translated).
const ERRORS = {
  invalid_code: 'The code is not correct. Check the latest email and try again.',
  challenge_expired: 'The code has expired. Request a new one.',
  challenge_unavailable: 'The code has expired. Request a new one.',
  authentication_failed: 'Wrong username or password.',
  gmail_required: 'Please use a Gmail address.',
  weak_password: 'Choose a stronger password (at least 12 characters).',
  invalid_username: 'Usernames use 3–32 letters, numbers, dots, dashes or underscores.',
  account_unavailable: 'This username or email is already in use.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  plan_unavailable: 'This plan is not available right now.',
  payment_required: 'This plan needs a payment, which is not available yet.',
  request_failed: 'Something went wrong. Try again.',
};
const explain = (code) => t(ERRORS[code] || String(code || 'request_failed').replaceAll('_', ' '));
const form = document.getElementById('loginForm');
const fields = document.getElementById('onboardingFields');
const title = document.getElementById('onboardingTitle');
const subtitle = document.getElementById('onboardingSubtitle');
const error = document.getElementById('error');
const nav = document.getElementById('onboardingNav');
let csrfToken = '';
let catalog = null;
let pendingChallengeId = '';
let pendingEmail = '';

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json', 'x-syc-csrf': csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || 'request_failed');
  return value.data;
}

const ICONS = {
  user: '<path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/>',
  lock: '<path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v11H5V10Zm7 4v3"/>',
  mail: '<path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
};
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
// One field: the same icon + placeholder shell as the static markup, plus the
// show-password eye on password fields.
const input = (id, label, type = 'text', autocomplete = '', icon = 'user', placeholder = '') => `
  <label class="login-field" for="${id}"><span class="login-field-label">${t(label)}</span>
  <span class="login-input-shell"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>
  <input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" placeholder="${t(placeholder)}" required>
  ${type === 'password' ? `<button class="login-password-toggle" type="button" aria-label="${t('Show password')}" aria-pressed="false">${EYE}</button>` : ''}</span></label>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Titles show the brand name in the accent blue.
const setTitle = (text) => { title.innerHTML = escapeHtml(t(text)).replace('SYC-AI', '<b>SYC-AI</b>'); };

function render() {
  const state = flow.snapshot();
  error.textContent = '';
  nav.hidden = state.step === 'plan_selection' || state.step === 'activated';
  const current = { signin: 'signin', signup_request: 'signup', signup_verify: 'signup', recovery_request: state.purpose === 'reset_password' ? 'password' : 'username', recovery_verify: state.purpose === 'reset_password' ? 'password' : 'username' }[state.step];
  nav.querySelectorAll('[data-mode]').forEach((button) => { button.hidden = button.dataset.mode === current; });
  if (state.step === 'signin') {
    setTitle('Welcome to SYC-AI'); subtitle.textContent = t('All you need with AI, in one place');
    fields.innerHTML = input('username', 'Username', 'text', 'username', 'user', 'Enter your username') + input('password', 'Password', 'password', 'current-password', 'lock', 'Enter your password');
    form.dataset.action = 'login'; document.getElementById('submitLabel').textContent = t('Sign in');
  } else if (state.step === 'signup_request') {
    setTitle('Create your account'); subtitle.textContent = t('Start with your Gmail address');
    fields.innerHTML = input('email', 'Gmail', 'email', 'email', 'mail', 'Enter your Gmail address');
    form.dataset.action = 'request-signup'; document.getElementById('submitLabel').textContent = t('Send code');
  } else if (state.step === 'signup_verify') {
    setTitle('Verify and create account'); subtitle.textContent = t('Enter the code sent to your Gmail (check Spam too if it is not in your inbox)');
    fields.innerHTML = input('otp', 'Verification code', 'text', 'one-time-code', 'key', 'Enter the code from the email') + input('username', 'Username', 'text', 'username', 'user', 'Choose a username') + input('password', 'Password', 'password', 'new-password', 'lock', 'At least 12 characters');
    form.dataset.action = 'signup'; document.getElementById('submitLabel').textContent = t('Create account');
  } else if (state.step === 'recovery_request') {
    setTitle('Account recovery'); subtitle.textContent = t('Verify your Gmail to continue');
    fields.innerHTML = input('email', 'Gmail', 'email', 'email', 'mail', 'Enter your Gmail address');
    form.dataset.action = 'request-recovery'; document.getElementById('submitLabel').textContent = t('Send code');
  } else if (state.step === 'recovery_verify') {
    const reset = state.purpose === 'reset_password';
    setTitle(reset ? 'Reset password' : 'Recover username');
    fields.innerHTML = input('otp', 'Verification code', 'text', 'one-time-code', 'key', 'Enter the code from the email') + (reset ? input('password', 'New password', 'password', 'new-password', 'lock', 'At least 12 characters') : '');
    form.dataset.action = reset ? 'reset-password' : 'recover-username';
    document.getElementById('submitLabel').textContent = t(reset ? 'Reset password' : 'Recover username');
  } else if (state.step === 'plan_selection') {
    const offer = state.catalog.plans.find((plan) => plan.id === 'main')?.offerEndsAt;
    const daysLeft = offer ? Math.max(0, Math.ceil((Date.parse(offer) - Date.now()) / 86_400_000)) : null;
    const offerDate = offer ? new Date(offer).toLocaleDateString(window.SYC?.i18n?.lang || undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    setTitle('Choose your plan');
    subtitle.textContent = offer ? t('Main is free until {date}', { date: offerDate }) : t('Main is free during the launch offer');
    fields.innerHTML = `<div class="plan-grid">${state.catalog.plans.map((plan) => `
      <button type="button" class="plan-card" data-plan="${plan.id}" ${plan.selectable ? '' : 'disabled'}>
      <strong>${plan.displayName}</strong><span>${plan.id === 'main' ? `<s>1.75 USDT</s> ${t('Free now')}` : t('Coming soon')}</span>
      ${plan.id === 'main' && daysLeft !== null ? `<small>${t(daysLeft === 1 ? '1 day left in the launch offer' : '{n} days left in the launch offer', { n: daysLeft })}</small>` : ''}</button>`).join('')}</div>`;
    form.dataset.action = 'activate'; document.getElementById('submitLabel').textContent = t('Activate Main');
    const main = state.catalog.plans.find((plan) => plan.id === 'main' && plan.selectable);
    if (main) flow.dispatch('select_plan', { planId: 'main' });
  }
}

async function authenticated(user) {
  if (!user?.plan) user = (await api('/api/onboarding/session').catch(() => null))?.user || user;
  if (user?.plan?.active) { const next = new URLSearchParams(location.search).get('next') || ''; location.href = /^\/(?!\/)/.test(next) ? next : '/main'; return; }
  flow.dispatch('authenticated', { user, catalog }); render();
}

// Show / hide the password in any password field on the current screen.
fields.addEventListener('click', (event) => {
  const toggle = event.target.closest('.login-password-toggle');
  if (!toggle) return;
  const field = toggle.parentElement.querySelector('input');
  const show = field.type === 'password';
  field.type = show ? 'text' : 'password';
  toggle.setAttribute('aria-pressed', String(show));
  toggle.setAttribute('aria-label', t(show ? 'Hide password' : 'Show password'));
});

nav.addEventListener('click', (event) => {
  const mode = event.target.closest('button')?.dataset.mode;
  if (mode === 'signin') flow.dispatch('show_signin');
  if (mode === 'signup') flow.dispatch('show_signup');
  if (mode === 'username') flow.dispatch('show_recovery', { purpose: 'recover_username' });
  if (mode === 'password') flow.dispatch('show_recovery', { purpose: 'reset_password' });
  render();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault(); error.textContent = ''; document.getElementById('submit').disabled = true;
  const values = Object.fromEntries(new FormData(form));
  try {
    switch (form.dataset.action) {
      case 'login': await authenticated((await api('/api/onboarding/login', values)).user); break;
      case 'request-signup':
        pendingEmail = values.email;
        pendingChallengeId = (await api('/api/onboarding/otp', { email: pendingEmail, purpose: 'signup' })).challengeId;
        flow.dispatch('otp_requested', { purpose: 'signup' }); render(); break;
      case 'signup':
        await api('/api/onboarding/signup', {
          challengeId: pendingChallengeId, code: values.otp, email: pendingEmail,
          username: values.username, password: values.password,
        });
        await authenticated((await api('/api/onboarding/login', { username: values.username, password: values.password })).user); break;
      case 'request-recovery':
        pendingEmail = values.email;
        pendingChallengeId = (await api('/api/onboarding/otp', { email: pendingEmail, purpose: flow.snapshot().purpose })).challengeId;
        flow.dispatch('otp_requested', { purpose: flow.snapshot().purpose }); render(); break;
      case 'recover-username':
        error.textContent = `${t('Username')}: ${(await api('/api/onboarding/recover-username', {
          challengeId: pendingChallengeId, code: values.otp, email: pendingEmail,
        })).username}`; return;
      case 'reset-password':
        await api('/api/onboarding/reset-password', {
          challengeId: pendingChallengeId, code: values.otp, email: pendingEmail,
          password: values.password,
        });
        flow.dispatch('recovered'); render(); break;
      case 'activate': {
        const result = await api('/api/onboarding/activate', { planId: flow.snapshot().selectedPlanId });
        flow.dispatch('activated', result); location.href = '/main'; break;
      }
    }
  } catch (caught) { error.textContent = explain(caught.message); }
  finally { document.getElementById('submit').disabled = false; }
});

try {
  const bootstrap = await api('/api/onboarding/bootstrap');
  catalog = bootstrap.catalog; csrfToken = bootstrap.csrf.csrfToken;
  const session = await api('/api/onboarding/session').catch(() => null);
  if (session?.user) await authenticated(session.user); else render();
} catch { render(); error.textContent = t('The SYC-AI service is temporarily unavailable.'); }

// Switching language re-renders the step that is on screen.
document.addEventListener('syc:language', () => { if (flow.snapshot().step !== 'activated') render(); });
