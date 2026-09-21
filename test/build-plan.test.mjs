import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBuildTargets } from '../installer/build-plan.mjs';

test('release build plan requires an explicit core-only choice or builds every artifact', () => {
  assert.deepEqual(resolveBuildTargets(undefined), { core: true, panels: true, full: true });
  assert.deepEqual(resolveBuildTargets('core'), { core: true, panels: false, full: false });
  assert.throws(() => resolveBuildTargets('partial'), /SYC_BUILD_TARGETS/);
});
