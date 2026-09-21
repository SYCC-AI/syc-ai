function safePlan(plan, now) {
  const deadline = plan.offerEndsAt ? Date.parse(plan.offerEndsAt) : null;
  const remainingSeconds = Number.isFinite(deadline)
    ? Math.max(0, Math.ceil((deadline - now) / 1000))
    : null;
  return Object.freeze({
    id: String(plan.id || ''),
    displayName: String(plan.displayName || ''),
    available: plan.available === true,
    selectable: plan.available === true && (remainingSeconds === null || remainingSeconds > 0),
    currency: String(plan.currency || ''),
    originalPriceMinor: Number(plan.originalPriceMinor || 0),
    effectivePriceMinor: Number(plan.effectivePriceMinor || 0),
    offerLabel: plan.offerLabel ? String(plan.offerLabel) : null,
    offerEndsAt: Number.isFinite(deadline) ? new Date(deadline).toISOString() : null,
    remainingSeconds,
    features: plan.features && typeof plan.features === 'object' ? { ...plan.features } : {},
  });
}

export function normalizeCatalog(value, now = Date.now()) {
  if (!value || !Array.isArray(value.plans)) throw new TypeError('valid catalog is required');
  return Object.freeze({
    generatedAt: String(value.generatedAt || ''),
    plans: Object.freeze(value.plans.map((plan) => safePlan(plan, now))),
  });
}

export function createOnboardingState({ now = Date.now } = {}) {
  let state = { step: 'signin', purpose: null, user: null, catalog: null, selectedPlanId: null };

  function dispatch(event, payload = {}) {
    switch (event) {
      case 'show_signin':
        state = { ...state, step: 'signin', purpose: null, selectedPlanId: null };
        break;
      case 'show_signup':
        state = { ...state, step: 'signup_request', purpose: 'signup' };
        break;
      case 'show_recovery':
        if (!['recover_username', 'reset_password'].includes(payload.purpose)) {
          throw new Error('invalid recovery purpose');
        }
        state = { ...state, step: 'recovery_request', purpose: payload.purpose };
        break;
      case 'otp_requested':
        if (payload.purpose !== state.purpose) throw new Error('invalid OTP purpose');
        state = {
          ...state,
          step: payload.purpose === 'signup' ? 'signup_verify' : 'recovery_verify',
        };
        break;
      case 'recovered':
        if (state.step !== 'recovery_verify') throw new Error('invalid recovery transition');
        state = { step: 'signin', purpose: null, user: null, catalog: null, selectedPlanId: null };
        break;
      case 'authenticated':
        state = {
          step: 'plan_selection', purpose: null,
          user: payload.user ? { username: String(payload.user.username || '') } : null,
          catalog: normalizeCatalog(payload.catalog, now()), selectedPlanId: null,
        };
        break;
      case 'select_plan': {
        if (state.step !== 'plan_selection') throw new Error('invalid plan transition');
        const plan = state.catalog.plans.find(({ id }) => id === payload.planId);
        if (!plan?.selectable) throw new Error('plan unavailable');
        state = { ...state, selectedPlanId: plan.id };
        break;
      }
      case 'activated':
        if (state.step !== 'plan_selection' || payload.planId !== state.selectedPlanId || !payload.installationId) {
          throw new Error('invalid activation transition');
        }
        state = {
          step: 'activated', purpose: null, user: state.user, catalog: state.catalog,
          selectedPlanId: payload.planId,
          activation: { installationId: String(payload.installationId), planId: payload.planId },
        };
        break;
      default:
        throw new Error('unsupported onboarding event');
    }
    return snapshot();
  }

  function snapshot() {
    return structuredClone(state);
  }

  return Object.freeze({ dispatch, snapshot });
}
