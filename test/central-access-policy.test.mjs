import assert from 'node:assert/strict';
import test from 'node:test';
import { centralRouteDecision } from '../central-access-policy.mjs';

test('central mode blocks every legacy device-authentication endpoint', () => {
  for (const pathname of ['/api/device/login', '/api/device/heartbeat']) {
    assert.deepEqual(centralRouteDecision({ pathname, authorization: { authorized: true } }), {
      allow: false, status: 409, reason: 'central_device_enrollment_required',
    });
  }
});

test('restricted mode permits only the account shell and denies protected APIs and tools', () => {
  const restricted = { authorized: true, restricted: true, access: { reason: 'entitlement_expired' } };
  assert.deepEqual(centralRouteDecision({ pathname: '/main', authorization: restricted }), { allow: true });
  assert.deepEqual(centralRouteDecision({ pathname: '/main.js', authorization: restricted }), { allow: true });
  assert.deepEqual(centralRouteDecision({ pathname: '/api/panels/status', authorization: restricted }), {
    allow: false, status: 403, reason: 'entitlement_expired',
  });
  assert.deepEqual(centralRouteDecision({ pathname: '/profage', authorization: restricted }), {
    allow: false, status: 302, reason: 'entitlement_expired',
  });
});

test('active central authorization permits non-device protected routes', () => {
  assert.deepEqual(centralRouteDecision({ pathname: '/profage', authorization: { authorized: true } }), { allow: true });
});
