import assert from 'node:assert/strict';
import test from 'node:test';

import { startLegacyEdgeClient } from '../server-startup.mjs';

test('central onboarding prevents the legacy edge client from starting', async () => {
  let loads = 0;

  const started = await startLegacyEdgeClient({
    centralOnboardingEnabled: true,
    loadEdgeClient: async () => {
      loads += 1;
      return { startEdge() {} };
    },
  });

  assert.equal(started, false);
  assert.equal(loads, 0);
});

test('legacy mode still starts the edge client', async () => {
  let starts = 0;

  const started = await startLegacyEdgeClient({
    centralOnboardingEnabled: false,
    loadEdgeClient: async () => ({
      startEdge() {
        starts += 1;
      },
    }),
  });

  assert.equal(started, true);
  assert.equal(starts, 1);
});
