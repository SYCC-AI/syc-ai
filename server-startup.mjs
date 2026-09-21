export async function startLegacyEdgeClient({
  centralOnboardingEnabled,
  loadEdgeClient = () => import('./edge-client.mjs'),
} = {}) {
  if (centralOnboardingEnabled) return false;
  const edgeClient = await loadEdgeClient();
  edgeClient.startEdge();
  return true;
}
