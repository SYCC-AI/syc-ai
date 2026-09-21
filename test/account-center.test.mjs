import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAccountCenterClient,
  renderPlanCards,
  renderTicketList,
  renderTicketThread,
} from '../public/account-center.mjs';

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('account center uses fixed same-origin support routes and bootstrap CSRF', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/onboarding/bootstrap') {
      return response(200, { data: { catalog: { plans: [] }, csrf: { csrfToken: 'csrf-1' } } });
    }
    return response(200, { data: { ok: true } });
  };
  const client = createAccountCenterClient({ fetchImpl });
  await client.bootstrap();
  await client.exportAccount();
  await client.listTickets();
  await client.createTicket({ subject: 'Update failed', category: 'technical', severity: 'high', body: 'Details' });
  await client.thread('123e4567-e89b-42d3-a456-426614174000');
  await client.reply('123e4567-e89b-42d3-a456-426614174000', 'More details');
  await client.logout();

  assert.deepEqual(calls.map(({ url, options }) => [url, options.method || 'GET']), [
    ['/api/onboarding/bootstrap', 'GET'],
    ['/api/onboarding/export', 'GET'],
    ['/api/onboarding/tickets', 'GET'],
    ['/api/onboarding/tickets', 'POST'],
    ['/api/onboarding/tickets/123e4567-e89b-42d3-a456-426614174000', 'GET'],
    ['/api/onboarding/tickets/123e4567-e89b-42d3-a456-426614174000/replies', 'POST'],
    ['/api/onboarding/logout', 'POST'],
  ]);
  assert.equal(calls[3].options.headers['x-syc-csrf'], 'csrf-1');
  await assert.rejects(client.thread('../admin'), /invalid ticket id/);
  assert.equal(calls.length, 7);
});

test('account center renders server plan names and prices without obsolete editions', () => {
  const html = renderPlanCards([
    { id: 'starter', displayName: 'Starter', currency: 'USDT', originalPriceMinor: 0, effectivePriceMinor: 0, available: false },
    { id: 'main', displayName: 'SYC-AI (Main)', currency: 'USDT', originalPriceMinor: 175, effectivePriceMinor: 0, available: true, offerLabel: 'Launch offer' },
    { id: 'plus', displayName: 'Plus', currency: 'USDT', originalPriceMinor: 0, effectivePriceMinor: 0, available: false },
    { id: 'pro', displayName: 'Pro', currency: 'USDT', originalPriceMinor: 0, effectivePriceMinor: 0, available: false },
    { id: 'immortal', displayName: 'Immortal Edition', currency: 'USDT', originalPriceMinor: 0, effectivePriceMinor: 0, available: false },
  ], 'main');
  assert.match(html, /SYC-AI \(Main\)/);
  assert.match(html, /<s>1\.75 USDT<\/s>/);
  assert.match(html, /Immortal Edition/);
  assert.doesNotMatch(html, /Super Pro/);
});

test('account center escapes ticket summaries and messages', () => {
  const list = renderTicketList([{ id: '123e4567-e89b-42d3-a456-426614174000', subject: '<img onerror=alert(1)>', status: 'open', severity: 'high' }]);
  const thread = renderTicketThread({
    id: '123e4567-e89b-42d3-a456-426614174000', subject: '<script>x</script>', status: 'answered',
    messages: [{ senderType: 'admin', body: '<b>unsafe</b>', createdAt: '2026-09-20T21:00:00.000Z' }],
  });
  assert.doesNotMatch(list + thread, /<script>x|<img onerror|<b>unsafe/);
  assert.match(list, /&lt;img onerror=alert\(1\)&gt;/);
  assert.match(thread, /&lt;b&gt;unsafe&lt;\/b&gt;/);
});
