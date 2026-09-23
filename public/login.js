import { createOnboardingState } from './onboarding-state.mjs';

const flow = createOnboardingState();
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

const input = (id, label, type = 'text', autocomplete = '') => `
  <label class="login-field" for="${id}"><span class="login-field-label">${label}</span>
  <span class="login-input-shell"><input id="${id}" name="${id}" type="${type}"
  autocomplete="${autocomplete}" required></span></label>`;

function render() {
  const state = flow.snapshot();
  error.textContent = '';
  nav.hidden = state.step === 'plan_selection' || state.step === 'activated';
  if (state.step === 'signin') {
    title.textContent = 'Welcome to SYC-AI'; subtitle.textContent = 'Sign in to your command center';
    fields.innerHTML = input('username', 'Username', 'text', 'username') + input('password', 'Password', 'password', 'current-password');
    form.dataset.action = 'login'; document.getElementById('submitLabel').textContent = 'Sign in';
  } else if (state.step === 'signup_request') {
    title.textContent = 'Create your account'; subtitle.textContent = 'Start with your Gmail address';
    fields.innerHTML = input('email', 'Gmail', 'email', 'email');
    form.dataset.action = 'request-signup'; document.getElementById('submitLabel').textContent = 'Send code';
  } else if (state.step === 'signup_verify') {
    title.textContent = 'Verify and create account'; subtitle.textContent = 'Enter the code sent to your Gmail';
    fields.innerHTML = input('otp', 'Verification code', 'text', 'one-time-code') + input('username', 'Username', 'text', 'username') + input('password', 'Password', 'password', 'new-password');
    form.dataset.action = 'signup'; document.getElementById('submitLabel').textContent = 'Create account';
  } else if (state.step === 'recovery_request') {
    title.textContent = 'Account recovery'; subtitle.textContent = 'Verify your Gmail to continue';
    fields.innerHTML = input('email', 'Gmail', 'email', 'email');
    form.dataset.action = 'request-recovery'; document.getElementById('submitLabel').textContent = 'Send code';
  } else if (state.step === 'recovery_verify') {
    const reset = state.purpose === 'reset_password';
    title.textContent = reset ? 'Reset password' : 'Recover username';
    fields.innerHTML = input('otp', 'Verification code', 'text', 'one-time-code') + (reset ? input('password', 'New password', 'password', 'new-password') : '');
    form.dataset.action = reset ? 'reset-password' : 'recover-username';
    document.getElementById('submitLabel').textContent = reset ? 'Reset password' : 'Recover username';
  } else if (state.step === 'plan_selection') {
    const offer = state.catalog.plans.find((plan) => plan.id === 'main')?.offerEndsAt;
    const daysLeft = offer ? Math.max(0, Math.ceil((Date.parse(offer) - Date.now()) / 86_400_000)) : null;
    const offerDate = offer ? new Date(offer).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    title.textContent = 'Choose your plan';
    subtitle.textContent = offer ? `Main is free until ${offerDate}` : 'Main is free during the launch offer';
    fields.innerHTML = `<div class="plan-grid">${state.catalog.plans.map((plan) => `
      <button type="button" class="plan-card" data-plan="${plan.id}" ${plan.selectable ? '' : 'disabled'}>
      <strong>${plan.displayName}</strong><span>${plan.id === 'main' ? '<s>1.75 USDT</s> Free now' : 'Coming soon'}</span>
      ${plan.id === 'main' && daysLeft !== null ? `<small>${daysLeft} day${daysLeft === 1 ? '' : 's'} left in the launch offer</small>` : ''}</button>`).join('')}</div>`;
    form.dataset.action = 'activate'; document.getElementById('submitLabel').textContent = 'Activate Main';
    const main = state.catalog.plans.find((plan) => plan.id === 'main' && plan.selectable);
    if (main) flow.dispatch('select_plan', { planId: 'main' });
  }
}

async function authenticated(user) {
  if (!user?.plan) user = (await api('/api/onboarding/session').catch(() => null))?.user || user;
  if (user?.plan?.active) { const next = new URLSearchParams(location.search).get('next') || ''; location.href = /^\/(?!\/)/.test(next) ? next : '/main'; return; }
  flow.dispatch('authenticated', { user, catalog }); render();
}

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
        error.textContent = `Username: ${(await api('/api/onboarding/recover-username', {
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
  } catch (caught) { error.textContent = caught.message.replaceAll('_', ' '); }
  finally { document.getElementById('submit').disabled = false; }
});

try {
  const bootstrap = await api('/api/onboarding/bootstrap');
  catalog = bootstrap.catalog; csrfToken = bootstrap.csrf.csrfToken;
  const session = await api('/api/onboarding/session').catch(() => null);
  if (session?.user) await authenticated(session.user); else render();
} catch { render(); error.textContent = 'The SYC-AI service is temporarily unavailable.'; }
