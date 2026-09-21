const RESTRICTED_SHELL = new Set(['/main', '/main/', '/main.js']);
const LEGACY_DEVICE = new Set(['/api/device/login', '/api/device/heartbeat']);

export function centralRouteDecision({ pathname, authorization } = {}) {
  const path = String(pathname || '');
  if (LEGACY_DEVICE.has(path)) {
    return { allow: false, status: 409, reason: 'central_device_enrollment_required' };
  }
  if (authorization?.authorized && !authorization.restricted) return { allow: true };
  if (authorization?.authorized && RESTRICTED_SHELL.has(path)) return { allow: true };
  const reason = authorization?.access?.reason || authorization?.reason || 'login_required';
  return { allow: false, status: path.startsWith('/api/') ? 403 : 302, reason };
}
