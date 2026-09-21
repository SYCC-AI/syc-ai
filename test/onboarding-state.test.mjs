import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnboardingState, normalizeCatalog } from '../public/onboarding-state.mjs';

const catalog = {
  generatedAt: '2026-09-20T18:00:00.000Z',
  plans: [
    { id: 'starter', displayName: 'Starter', available: false, originalPriceMinor: 0, effectivePriceMinor: 0 },
    { id: 'main', displayName: 'Main', available: true, originalPriceMinor: 175, effectivePriceMinor: 0, offerEndsAt: '2026-10-22T20:29:59.000Z' },
    { id: 'plus', displayName: 'Plus', available: false, originalPriceMinor: 0, effectivePriceMinor: 0 },
    { id: 'pro', displayName: 'Pro', available: false, originalPriceMinor: 0, effectivePriceMinor: 0 },
    { id: 'immortal', displayName: 'Immortal Edition', available: false, originalPriceMinor: 0, effectivePriceMinor: 0 },
  ],
};

test('catalog preserves server order and derives availability and countdown boundaries', () => {
  const before = normalizeCatalog(catalog, Date.parse('2026-10-22T20:29:58.000Z'));
  assert.deepEqual(before.plans.map(({ id }) => id), ['starter', 'main', 'plus', 'pro', 'immortal']);
  assert.equal(before.plans.find(({ id }) => id === 'main').selectable, true);
  assert.equal(before.plans.find(({ id }) => id === 'starter').selectable, false);
  assert.equal(before.plans.find(({ id }) => id === 'main').remainingSeconds, 1);
  const ended = normalizeCatalog(catalog, Date.parse('2026-10-22T20:29:59.000Z'));
  assert.equal(ended.plans.find(({ id }) => id === 'main').selectable, false);
  assert.equal(ended.plans.find(({ id }) => id === 'main').remainingSeconds, 0);
});

test('onboarding transitions through login, signup, recovery, plans and activation without retaining secrets', () => {
  const flow = createOnboardingState();
  assert.equal(flow.snapshot().step, 'signin');
  flow.dispatch('show_signup');
  flow.dispatch('otp_requested', { purpose: 'signup', email: 'owner@gmail.com' });
  assert.equal(flow.snapshot().step, 'signup_verify');
  flow.dispatch('authenticated', { user: { username: 'owner' }, catalog });
  assert.equal(flow.snapshot().step, 'plan_selection');
  assert.throws(() => flow.dispatch('select_plan', { planId: 'pro' }), /unavailable/);
  flow.dispatch('select_plan', { planId: 'main' });
  flow.dispatch('activated', { installationId: 'install-1', planId: 'main' });
  assert.equal(flow.snapshot().step, 'activated');
  assert.doesNotMatch(JSON.stringify(flow.snapshot()), /owner@gmail.com|password|123456/);

  const recovery = createOnboardingState();
  recovery.dispatch('show_recovery', { purpose: 'recover_username' });
  recovery.dispatch('otp_requested', { purpose: 'recover_username', email: 'owner@gmail.com' });
  assert.equal(recovery.snapshot().step, 'recovery_verify');
  recovery.dispatch('recovered');
  assert.equal(recovery.snapshot().step, 'signin');
});
