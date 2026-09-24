const TICKET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function price(minor, currency) {
  const amount = Number(minor || 0) / 100;
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${escapeHtml(currency || '')}`.trim();
}

async function readResponse(response) {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || 'request_failed');
  return value.data;
}

export function createAccountCenterClient({ fetchImpl = fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  let csrfToken = '';

  async function request(path, body) {
    const mutation = body !== undefined;
    if (mutation && !csrfToken) throw new Error('csrf_unavailable');
    return readResponse(await fetchImpl(path, {
      method: mutation ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: mutation ? { 'content-type': 'application/json', 'x-syc-csrf': csrfToken } : {},
      body: mutation ? JSON.stringify(body) : undefined,
    }));
  }

  function ticketPath(ticketId, suffix = '') {
    if (!TICKET_ID.test(String(ticketId))) throw new Error('invalid ticket id');
    return `/api/onboarding/tickets/${ticketId}${suffix}`;
  }

  return Object.freeze({
    async bootstrap() {
      const data = await request('/api/onboarding/bootstrap');
      csrfToken = String(data?.csrf?.csrfToken || '');
      if (!csrfToken || !Array.isArray(data?.catalog?.plans)) throw new Error('invalid_account_bootstrap');
      return data;
    },
    listTickets: () => request('/api/onboarding/tickets'),
    exportAccount: () => request('/api/onboarding/export'),
    changePassword: (input) => request('/api/onboarding/password', input),
    createTicket: (input) => request('/api/onboarding/tickets', input),
    async thread(ticketId) { return request(ticketPath(ticketId)); },
    async reply(ticketId, body) { return request(ticketPath(ticketId, '/replies'), { body }); },
    logout: () => request('/api/onboarding/logout', {}),
  });
}

export function renderPlanCards(plans = [], currentPlanId = '') {
  return plans.map((plan) => {
    const current = plan.id === currentPlanId;
    const original = Number(plan.originalPriceMinor || 0);
    const effective = Number(plan.effectivePriceMinor || 0);
    // An edition that is not open yet shows no price: it is announced when it opens.
    const cost = !plan.available && !current
      ? 'Price announced at launch'
      : original > effective
        ? `<s>${price(original, plan.currency)}</s> ${effective === 0 ? 'Free now' : price(effective, plan.currency)}`
        : price(effective, plan.currency) || 'Coming soon';
    const until = plan.offerEndsAt && Date.parse(plan.offerEndsAt)
      ? ` · free until ${new Date(plan.offerEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`
      : '';
    // Payments are not open yet: a paid edition shows what it will cost and a
    // disabled button, so nobody mistakes "coming" for "broken".
    const upgrade = current ? '' : '<button type="button" disabled aria-disabled="true">Upgrade · opens soon</button>';
    return `<article class="upgrade-card${current ? ' current' : ''}">
      <b>${escapeHtml(plan.displayName)}</b><small class="plan-price">${cost}${effective === 0 && original > effective ? until : ''}</small>
      <em>${current ? 'Active' : plan.available ? escapeHtml(plan.offerLabel || 'Available') : 'Coming soon'}</em>
      ${upgrade}
    </article>`;
  }).join('');
}

export function renderTicketList(tickets = []) {
  if (!tickets.length) return '<p class="profile-note">No support tickets yet.</p>';
  return tickets.map((ticket) => `<button class="ticket-summary" type="button" data-ticket-id="${escapeHtml(ticket.id)}">
    <strong>${escapeHtml(ticket.subject)}</strong>
    <span>${escapeHtml(ticket.category)} · ${escapeHtml(ticket.severity)} · ${escapeHtml(ticket.status)}</span>
  </button>`).join('');
}

export function renderTicketThread(ticket = {}) {
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  return `<section class="ticket-thread" data-ticket-id="${escapeHtml(ticket.id)}">
    <header><button class="ghost" type="button" data-ticket-back>← Tickets</button><h3>${escapeHtml(ticket.subject)}</h3><small>${escapeHtml(ticket.status)}</small></header>
    <div class="ticket-messages">${messages.map((message) => `<article class="ticket-message ${message.senderType === 'admin' ? 'admin' : 'user'}">
      <b>${message.senderType === 'admin' ? 'SYC support' : 'You'}</b><p>${escapeHtml(message.body)}</p>
      <time>${escapeHtml(message.createdAt)}</time></article>`).join('')}</div>
    ${ticket.status === 'closed' ? '' : '<form id="ticketReplyForm"><label>Reply<textarea id="ticketReplyBody" maxlength="5000" required></textarea></label><button class="primary" type="submit">Send reply</button><p class="form-status" id="ticketReplyStatus" aria-live="polite"></p></form>'}
  </section>`;
}
