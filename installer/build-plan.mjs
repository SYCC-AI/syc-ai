export function resolveBuildTargets(value) {
  const target = value == null || value === '' ? 'all' : String(value);
  if (target === 'all') return Object.freeze({ core: true, panels: true, full: true });
  if (target === 'core') return Object.freeze({ core: true, panels: false, full: false });
  throw new TypeError('SYC_BUILD_TARGETS must be all or core');
}
