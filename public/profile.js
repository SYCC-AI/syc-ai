(() => {
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const roleLabel = (role) => (role === 'admin' ? 'Admin' : role ? 'User' : 'SYC-AI account');
  let currentUser = null;
  let avatarDataUrl = '';
  let lastFocused = null;
  let accountCenter = null;
  let accountCatalog = null;
  let selectedTicketId = '';

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not reach the panel.');
    return data;
  }
  const post = (url, body) => request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  function avatarMarkup(user = currentUser, large = false) {
    const size = large ? ' profile-avatar-large' : '';
    if (user?.avatarUrl) return `<span class="profile-avatar${size}"><img src="${esc(user.avatarUrl)}" alt=""></span>`;
    return `<span class="profile-avatar${size}" aria-hidden="true">${esc(user?.avatar || '👤')}</span>`;
  }

  function ensureModal() {
    if (document.getElementById('profileModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-backdrop profile-layer" id="profileModal" hidden>
        <section class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
          <button class="modal-close" id="profileClose" type="button" aria-label="Close" data-i18n-attr="aria-label">×</button>
          <header class="profile-heading">
            <div id="profileModalAvatar">${avatarMarkup()}</div>
            <div><p class="profile-kicker" data-i18n>Personal account</p><h2 id="profileTitle" data-i18n>My profile</h2><p id="profileIdentity"></p></div>
          </header>
          <nav class="profile-tabs" aria-label="Profile sections" data-i18n-attr="aria-label">
            <button class="active" data-profile-tab="personal" type="button" data-i18n>Personal info</button>
            <button data-profile-tab="account" type="button" data-i18n>Account details</button>
            <button data-profile-tab="security" type="button" data-i18n>Security</button>
            <button data-profile-tab="upgrade" type="button" data-i18n>Upgrade</button>
            <button data-profile-tab="support" type="button">Support</button>
          </nav>

          <div class="profile-content">
            <form class="profile-pane active" id="profilePersonal" data-profile-pane="personal">
              <section class="profile-photo-editor">
                <div class="profile-photo-preview" id="profilePhotoPreview">${avatarMarkup(null, true)}</div>
                <div><b data-i18n>Profile picture</b><p data-i18n>PNG, JPG or WebP, up to 2 MB</p><div class="profile-inline-actions"><label class="secondary profile-upload"><span data-i18n>Choose image</span><input id="profilePhoto" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="ghost" id="profilePhotoReset" type="button" data-i18n>Discard new image</button></div></div>
              </section>
              <div class="profile-form-grid">
                <label><span data-i18n>First name</span><input id="profileFirstName" maxlength="50" autocomplete="given-name"></label>
                <label><span data-i18n>Last name</span><input id="profileLastName" maxlength="60" autocomplete="family-name"></label>
                <label class="profile-span-2"><span data-i18n>Display name</span><input id="profileDisplayName" maxlength="60" autocomplete="nickname"></label>
                <label class="profile-span-2"><span data-i18n>Phone</span><input id="profilePhone" maxlength="24" inputmode="tel" autocomplete="tel"></label>
                <label class="profile-span-2"><span data-i18n>Address</span><textarea id="profileAddress" maxlength="300" rows="3" autocomplete="street-address"></textarea></label>
                <label class="profile-span-2"><span data-i18n>Fallback avatar</span> <span class="field-hint" data-i18n>Shown when there is no picture.</span><input id="profileAvatarInput" maxlength="12" placeholder="👤"></label>
              </div>
              <div class="profile-form-footer"><button class="primary" type="submit" data-i18n>Save</button><p class="form-status" id="profileInfoStatus" aria-live="polite"></p></div>
            </form>

            <section class="profile-pane" data-profile-pane="account">
              <div class="profile-account-card"><span class="profile-account-icon">@</span><div><small data-i18n>Username</small><strong id="profileUsername"></strong><p data-i18n>The sign-in name is set by the panel administrator.</p></div></div>
              <div class="profile-account-card" id="profileEmailCard" hidden><span class="profile-account-icon">✉</span><div><small>Email</small><strong id="profileEmail"></strong><p>Your verified central account address.</p></div></div>
              <div class="profile-account-card"><span class="profile-account-icon">◇</span><div><small data-i18n>Access level</small><strong id="profileRole"></strong><p data-i18n>Section access is controlled by role.</p></div></div>
              <div class="profile-account-card"><span class="profile-account-icon">★</span><div><small data-i18n>Edition</small><strong>SYC-AI (Main)</strong><p data-i18n>See the Upgrade section for other editions.</p></div></div>
              <div class="profile-account-card"><span class="profile-account-icon">⌁</span><div><small data-i18n>Password last changed</small><strong id="profilePasswordChanged">—</strong><p data-i18n>Change it from the Security section.</p></div></div>
              <div class="profile-account-card" id="profileExportCard" hidden><span class="profile-account-icon">⇩</span><div><small>Your data</small><strong>Account export</strong><p>Download your central account, installations, entitlements and support conversations.</p><button class="ghost" id="profileExport" type="button">Download JSON</button><p class="form-status" id="profileExportStatus" aria-live="polite"></p></div></div>
              <div class="profile-note" data-i18n>This profile is stored only on this panel.</div>
            </section>

            <section class="profile-pane" data-profile-pane="security">
              <div class="security-grid">
                <form class="security-card" id="profilePassword">
                  <div class="security-card-head"><span>⌁</span><div><h3 data-i18n>Change password</h3><p data-i18n>Changing the password signs out other active sessions.</p></div></div>
                  <label><span data-i18n>Current password</span><span class="password-field"><input id="profileCurrentPassword" type="password" autocomplete="current-password" required><button class="password-eye" type="button" aria-label="Show password">◉</button></span></label>
                  <label><span data-i18n>New password</span><span class="password-field"><input id="profileNewPassword" type="password" autocomplete="new-password" minlength="8" required><button class="password-eye" type="button" aria-label="Show password">◉</button></span></label>
                  <label><span data-i18n>Confirm new password</span><span class="password-field"><input id="profileConfirmPassword" type="password" autocomplete="new-password" minlength="8" required><button class="password-eye" type="button" aria-label="Show password">◉</button></span></label>
                  <p class="field-hint" data-i18n>At least 8 characters, with a letter, a number and a symbol.</p>
                  <button class="primary" type="submit" data-i18n>Change password</button><p class="form-status" id="profilePasswordStatus" aria-live="polite"></p>
                </form>
                <div class="security-card" id="twoFactorCard"></div>
                <div class="security-card">
                  <div class="security-card-head"><span>⎋</span><div><h3 data-i18n>Active sessions</h3><p data-i18n>Sign out every other browser or device that is signed in to this account.</p></div></div>
                  <div class="security-state" data-i18n>This browser stays signed in.</div>
                  <button class="ghost" id="profileRevokeSessions" type="button" data-i18n>Sign out other sessions</button><p class="form-status" id="profileSessionsStatus" aria-live="polite"></p>
                </div>
              </div>
            </section>

            <section class="profile-pane" data-profile-pane="upgrade">
              <div class="upgrade-intro"><p class="profile-kicker" data-i18n>Plans</p><h3 data-i18n>Upgrade your panel</h3><p data-i18n>You are using SYC-AI (Main).</p></div>
              <div class="upgrade-grid" id="accountPlanGrid">
                <article class="upgrade-card"><b>Starter</b><small>Coming soon</small><em>Unavailable</em></article>
                <article class="upgrade-card current"><b>SYC-AI (Main)</b><small>Your current edition</small><em>Active</em></article>
                <article class="upgrade-card"><b>Plus</b><small>Coming soon</small><em>Unavailable</em></article>
                <article class="upgrade-card"><b>Pro</b><small>Coming soon</small><em>Unavailable</em></article>
                <article class="upgrade-card"><b>Immortal Edition</b><small>Coming soon</small><em>Unavailable</em></article>
              </div>
              <div class="upgrade-intro"><p class="profile-kicker" data-i18n>Payment</p><h3 data-i18n>How you will pay</h3><p data-i18n>Payments open together with the paid editions. Main stays free until then.</p></div>
              <div class="pay-methods" aria-label="Payment methods">
                <div class="pay-method" aria-disabled="true"><span class="pm-icon">₮</span><div><b>USDT (TRC20)</b><small data-i18n>Opens with paid editions</small></div></div>
                <div class="pay-method" aria-disabled="true"><span class="pm-icon">💳</span><div><b data-i18n>Card (Visa / Mastercard)</b><small data-i18n>Opens with paid editions</small></div></div>
                <div class="pay-method" aria-disabled="true"><span class="pm-icon">P</span><div><b>PayPal</b><small data-i18n>Opens with paid editions</small></div></div>
              </div>
            </section>

            <section class="profile-pane" data-profile-pane="support">
              <div class="upgrade-intro"><p class="profile-kicker">Support</p><h3>Tickets</h3><p>Technical and financial requests stay attached to your SYC-AI account.</p></div>
              <form class="security-card" id="ticketCreateForm">
                <label>Subject<input id="ticketSubject" maxlength="120" minlength="5" required></label>
                <div class="profile-form-grid">
                  <label>Category<select id="ticketCategory"><option value="technical">Technical</option><option value="financial">Financial</option></select></label>
                  <label>Severity<select id="ticketSeverity"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                </div>
                <label>Message<textarea id="ticketBody" maxlength="5000" required></textarea></label>
                <button class="primary" type="submit">Create ticket</button><p class="form-status" id="ticketCreateStatus" aria-live="polite"></p>
              </form>
              <div class="ticket-list" id="ticketList"></div>
              <div id="ticketThread" hidden></div>
            </section>
          </div>
        </section>
      </div>`);

    const modal = document.getElementById('profileModal');
    window.SYC?.i18n?.apply(modal);
    document.getElementById('profileClose').onclick = close;
    modal.onclick = (event) => { if (event.target === modal) close(); };
    modal.querySelectorAll('[data-profile-tab]').forEach((button) => { button.onclick = () => activateTab(button.dataset.profileTab); });
    modal.querySelectorAll('.password-eye').forEach((button) => {
      button.onclick = () => {
        const input = button.previousElementSibling;
        input.type = input.type === 'password' ? 'text' : 'password';
        button.classList.toggle('active', input.type === 'text');
        button.setAttribute('aria-label', input.type === 'text' ? 'Hide password' : 'Show password');
      };
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) close(); });
    document.getElementById('profilePhoto').onchange = readPhoto;
    document.getElementById('profilePhotoReset').onclick = () => { avatarDataUrl = ''; document.getElementById('profilePhoto').value = ''; renderPhotoPreview(); };
    document.getElementById('profilePersonal').onsubmit = savePersonal;
    document.getElementById('profilePassword').onsubmit = changePassword;
    document.getElementById('profileRevokeSessions').onclick = revokeSessions;
    document.getElementById('profileExport').onclick = exportAccount;
    document.getElementById('ticketCreateForm').onsubmit = createTicket;
    document.getElementById('ticketList').onclick = (event) => {
      const ticketId = event.target.closest('[data-ticket-id]')?.dataset.ticketId;
      if (ticketId) showTicket(ticketId);
    };
    document.getElementById('ticketThread').onclick = (event) => {
      if (event.target.closest('[data-ticket-back]')) showTicketList();
    };
    document.getElementById('ticketThread').onsubmit = replyTicket;
  }

  function activateTab(name) {
    if (currentUser?.accountMode === 'central' && (name === 'personal' || name === 'security')) name = 'account';
    const modal = document.getElementById('profileModal');
    modal.querySelectorAll('[data-profile-tab]').forEach((item) => item.classList.toggle('active', item.dataset.profileTab === name));
    modal.querySelectorAll('[data-profile-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.profilePane === name));
    if (name === 'upgrade' || name === 'support') loadAccountData();
  }

  function close() {
    document.getElementById('profileModal').hidden = true;
    document.body.classList.remove('modal-open');
    lastFocused?.focus?.();
  }

  async function open(tab = 'personal') {
    activateTab(tab);
    lastFocused = document.activeElement;
    const modal = document.getElementById('profileModal');
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modal.classList.add('is-loading');
    try {
      const data = await request('/auth/profile');
      currentUser = data.user; avatarDataUrl = ''; render(); await loadAccountData();
    } catch (error) {
      const status = document.getElementById('profileInfoStatus'); status.textContent = error.message; status.className = 'form-status error';
    } finally { modal.classList.remove('is-loading'); document.getElementById('profileClose').focus(); }
  }

  function renderPhotoPreview() {
    const preview = document.getElementById('profilePhotoPreview');
    if (!preview) return;
    preview.innerHTML = avatarDataUrl
      ? `<span class="profile-avatar profile-avatar-large"><img src="${avatarDataUrl}" alt="New picture preview"></span>`
      : avatarMarkup(currentUser, true);
  }

  async function center() {
    if (!accountCenter) {
      const module = await import('/account-center.mjs');
      accountCenter = { module, client: module.createAccountCenterClient() };
    }
    return accountCenter;
  }

  async function loadAccountData() {
    if (currentUser?.accountMode !== 'central') return;
    try {
      const service = await center();
      const bootstrap = await service.client.bootstrap();
      accountCatalog = bootstrap.catalog;
      document.getElementById('accountPlanGrid').innerHTML = service.module.renderPlanCards(accountCatalog.plans, 'main');
      const tickets = await service.client.listTickets();
      document.getElementById('ticketList').innerHTML = service.module.renderTicketList(tickets);
    } catch (error) {
      const list = document.getElementById('ticketList');
      if (list) list.innerHTML = `<p class="form-status error">${esc(error.message)}</p>`;
    }
  }

  function showTicketList() {
    selectedTicketId = '';
    document.getElementById('ticketThread').hidden = true;
    document.getElementById('ticketList').hidden = false;
    document.getElementById('ticketCreateForm').hidden = false;
  }

  async function showTicket(ticketId) {
    try {
      const service = await center();
      const ticket = await service.client.thread(ticketId);
      selectedTicketId = ticket.id;
      const thread = document.getElementById('ticketThread');
      thread.innerHTML = service.module.renderTicketThread(ticket);
      thread.hidden = false;
      document.getElementById('ticketList').hidden = true;
      document.getElementById('ticketCreateForm').hidden = true;
    } catch (error) {
      document.getElementById('ticketList').innerHTML = `<p class="form-status error">${esc(error.message)}</p>`;
    }
  }

  async function createTicket(event) {
    event.preventDefault();
    const status = document.getElementById('ticketCreateStatus');
    const button = event.currentTarget.querySelector('[type=submit]');
    status.textContent = 'Creating…'; button.disabled = true;
    try {
      const service = await center();
      const ticket = await service.client.createTicket({
        subject: document.getElementById('ticketSubject').value,
        category: document.getElementById('ticketCategory').value,
        severity: document.getElementById('ticketSeverity').value,
        body: document.getElementById('ticketBody').value,
      });
      event.currentTarget.reset();
      status.textContent = 'Ticket created.'; status.className = 'form-status success';
      await loadAccountData();
      await showTicket(ticket.id);
    } catch (error) { status.textContent = error.message; status.className = 'form-status error'; }
    finally { button.disabled = false; }
  }

  async function replyTicket(event) {
    if (event.target.id !== 'ticketReplyForm') return;
    event.preventDefault();
    const status = document.getElementById('ticketReplyStatus');
    const button = event.target.querySelector('[type=submit]');
    status.textContent = 'Sending…'; button.disabled = true;
    try {
      const service = await center();
      await service.client.reply(selectedTicketId, document.getElementById('ticketReplyBody').value);
      await showTicket(selectedTicketId);
    } catch (error) { status.textContent = error.message; status.className = 'form-status error'; button.disabled = false; }
  }

  async function exportAccount() {
    const button = document.getElementById('profileExport');
    const status = document.getElementById('profileExportStatus');
    button.disabled = true; status.textContent = 'Preparing export…'; status.className = 'form-status';
    try {
      const service = await center();
      const exported = await service.client.exportAccount();
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'syc-ai-account-export.json'; link.click();
      URL.revokeObjectURL(url);
      status.textContent = 'Export downloaded.'; status.className = 'form-status success';
    } catch (error) { status.textContent = error.message; status.className = 'form-status error'; }
    finally { button.disabled = false; }
  }

  function applyAccountMode() {
    const central = currentUser?.accountMode === 'central';
    for (const name of ['personal', 'security']) {
      document.querySelectorAll(`[data-profile-tab="${name}"], [data-open-tab="${name}"]`).forEach((node) => { node.hidden = central; });
    }
    document.querySelectorAll('[data-profile-tab="support"], [data-open-tab="support"]').forEach((node) => { node.hidden = !central; });
    const emailCard = document.getElementById('profileEmailCard'); if (emailCard) emailCard.hidden = !central;
    const exportCard = document.getElementById('profileExportCard'); if (exportCard) exportCard.hidden = !central;
    const email = document.getElementById('profileEmail'); if (email) email.textContent = currentUser.email || '—';
  }

  function render() {
    if (!currentUser) return;
    document.querySelectorAll('#profileAvatar').forEach((node) => {
      if (currentUser.avatarUrl) node.innerHTML = `<img src="${esc(currentUser.avatarUrl)}" alt="">`;
      else node.textContent = currentUser.avatar || '👤';
    });
    const modalAvatar = document.getElementById('profileModalAvatar'); if (modalAvatar) modalAvatar.innerHTML = avatarMarkup(currentUser, true);
    renderPhotoPreview();
    const label = `${currentUser.username} · ${roleLabel(currentUser.role)}`;
    const identity = document.getElementById('profileIdentity'); if (identity) identity.textContent = label;
    const values = {
      profileDisplayName: currentUser.displayName || currentUser.username, profileAvatarInput: currentUser.avatar || '',
      profileFirstName: currentUser.firstName || '', profileLastName: currentUser.lastName || '',
      profilePhone: currentUser.phone || '', profileAddress: currentUser.address || '',
    };
    Object.entries(values).forEach(([id, value]) => { const field = document.getElementById(id); if (field) field.value = value; });
    const username = document.getElementById('profileUsername'); if (username) username.textContent = currentUser.username;
    const role = document.getElementById('profileRole'); if (role) role.textContent = roleLabel(currentUser.role);
    const changed = document.getElementById('profilePasswordChanged');
    if (changed) changed.textContent = currentUser.passwordChangedAt ? new Date(currentUser.passwordChangedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
    const who = document.getElementById('who'); if (who) who.textContent = label;
    const menuName = document.getElementById('avatarMenuName'); if (menuName) menuName.textContent = currentUser.displayName || currentUser.username;
    const menuRole = document.getElementById('avatarMenuRole'); if (menuRole) menuRole.textContent = `${currentUser.username} · ${roleLabel(currentUser.role)}`;
    applyAccountMode();
    if (currentUser.accountMode !== 'central') renderTwoFactor();
  }

  function renderTwoFactor(setup = null, message = '') {
    const card = document.getElementById('twoFactorCard'); if (!card || !currentUser) return;
    if (setup) {
      card.innerHTML = `<div class="security-card-head"><span>✓</span><div><h3>Connect an authenticator app</h3><p>Scan the QR code with Google Authenticator, Microsoft Authenticator or a similar app.</p></div></div><div class="totp-setup"><img src="${esc(setup.qrUrl)}" alt="Two-factor setup QR code"><p>Or enter this key manually:</p><code>${esc(setup.secret)}</code></div><form id="twoFactorEnable"><label>6-digit code<input id="twoFactorEnableCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label><button class="primary" type="submit">Verify and turn on</button><button class="ghost" id="twoFactorCancel" type="button">Cancel</button><p class="form-status" id="twoFactorStatus" aria-live="polite">${esc(message)}</p></form>`;
      document.getElementById('twoFactorCancel').onclick = () => renderTwoFactor();
      document.getElementById('twoFactorEnable').onsubmit = enableTwoFactor;
      return;
    }
    if (currentUser.twoFactorEnabled) {
      card.innerHTML = `<div class="security-card-head"><span class="security-good">✓</span><div><h3>Two-factor authentication is on</h3><p>A one-time code is required after the password.</p></div></div><div class="security-state success">The account is protected against sign-in with a leaked password.</div><form id="twoFactorDisable"><label>Current password<input id="twoFactorDisablePassword" type="password" autocomplete="current-password" required></label><label>Current 6-digit code<input id="twoFactorDisableCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button class="danger" type="submit">Turn off two-factor authentication</button><p class="form-status" id="twoFactorStatus" aria-live="polite">${esc(message)}</p></form>`;
      document.getElementById('twoFactorDisable').onsubmit = disableTwoFactor;
    } else {
      card.innerHTML = `<div class="security-card-head"><span>◇</span><div><h3>Two-factor authentication</h3><p>Add a one-time code as a second layer of security.</p></div></div><div class="security-state">Right now only the password is needed to sign in.</div><form id="twoFactorStart"><label>Current password<input id="twoFactorStartPassword" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Start setup</button><p class="form-status" id="twoFactorStatus" aria-live="polite">${esc(message)}</p></form>`;
      document.getElementById('twoFactorStart').onsubmit = startTwoFactor;
    }
  }

  async function startTwoFactor(event) {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); const status = document.getElementById('twoFactorStatus'); button.disabled = true; status.textContent = 'Creating a secure key…';
    try { const data = await post('/auth/profile/2fa/start', { currentPassword: document.getElementById('twoFactorStartPassword').value }); renderTwoFactor(data); document.getElementById('twoFactorEnableCode').focus(); }
    catch (error) { status.textContent = error.message; status.className = 'form-status error'; button.disabled = false; }
  }
  async function enableTwoFactor(event) {
    event.preventDefault(); const button = event.currentTarget.querySelector('.primary'); const status = document.getElementById('twoFactorStatus'); button.disabled = true; status.textContent = 'Checking the code…';
    try { const data = await post('/auth/profile/2fa/enable', { code: document.getElementById('twoFactorEnableCode').value }); currentUser = data.user; renderTwoFactor(null, 'Two-factor authentication is now on.'); }
    catch (error) { status.textContent = error.message; status.className = 'form-status error'; button.disabled = false; }
  }
  async function disableTwoFactor(event) {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); const status = document.getElementById('twoFactorStatus'); button.disabled = true; status.textContent = 'Checking…';
    try { const data = await post('/auth/profile/2fa/disable', { currentPassword: document.getElementById('twoFactorDisablePassword').value, code: document.getElementById('twoFactorDisableCode').value }); currentUser = data.user; renderTwoFactor(null, 'Two-factor authentication is now off.'); }
    catch (error) { status.textContent = error.message; status.className = 'form-status error'; button.disabled = false; }
  }
  async function revokeSessions() {
    const status = document.getElementById('profileSessionsStatus'); status.textContent = 'Signing out other sessions…'; status.className = 'form-status';
    try { await post('/auth/profile/sessions/revoke', {}); status.textContent = 'All other sessions were signed out.'; status.className = 'form-status success'; }
    catch (error) { status.textContent = error.message; status.className = 'form-status error'; }
  }

  // Avatar button at the top right: click opens the profile, hovering on a
  // desktop lists the profile sections.
  function mountAvatarMenu() {
    const host = document.getElementById('avatarMenu'); if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    host.innerHTML = `
      <button class="avatar-button" id="profileOpen" type="button" aria-haspopup="menu" aria-label="Open profile"><span class="profile-avatar" id="profileAvatar">👤</span></button>
      <div class="avatar-dropdown" role="menu">
        <div class="avatar-dropdown-head"><b id="avatarMenuName"></b><small id="avatarMenuRole"></small></div>
        <button type="button" role="menuitem" data-open-tab="personal" data-i18n>Personal info</button>
        <button type="button" role="menuitem" data-open-tab="account" data-i18n>Account details</button>
        <button type="button" role="menuitem" data-open-tab="security" data-i18n>Security</button>
        <button type="button" role="menuitem" data-open-tab="upgrade" data-i18n>Upgrade</button>
        <button type="button" role="menuitem" data-open-tab="support">Support</button>
        <hr>
        <div class="avatar-language" role="group" aria-label="Language">
          <small data-i18n>Language</small>
          <div class="avatar-language-options" id="avatarLanguage"></div>
        </div>
        <hr>
        <button type="button" role="menuitem" class="avatar-signout" id="avatarSignOut" data-i18n>Sign out</button>
      </div>`;
    mountLanguageOptions(host.querySelector('#avatarLanguage'));
    window.SYC?.i18n?.apply(host);
    host.querySelectorAll('[data-open-tab]').forEach((b) => { b.onclick = () => open(b.dataset.openTab); });
    document.getElementById('profileOpen').onclick = () => open('personal');
    document.getElementById('avatarSignOut').onclick = async () => {
      if (currentUser?.accountMode === 'central') {
        try {
          const service = await center();
          await service.client.bootstrap();
          await service.client.logout();
        } catch { return; }
      } else {
        await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      }
      location.href = '/login';
    };
  }

  // One row of language chips. Panels embedded in an iframe are told about the
  // change so the whole panel switches at once.
  function mountLanguageOptions(host) {
    const i18n = window.SYC?.i18n;
    if (!host || !i18n) return;
    host.textContent = '';
    for (const language of i18n.langs) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `avatar-language-chip${language.id === i18n.lang ? ' active' : ''}`;
      chip.lang = language.id;
      chip.textContent = language.label;
      chip.onclick = (event) => {
        event.stopPropagation();
        i18n.setLang(language.id);
        for (const frame of document.querySelectorAll('iframe')) {
          try { frame.contentWindow.postMessage({ type: 'syc:language', lang: language.id }, location.origin); } catch { /* cross-origin */ }
        }
        mountLanguageOptions(host);
      };
      host.append(chip);
    }
  }

  async function readPhoto(event) {
    const file = event.target.files?.[0]; const status = document.getElementById('profileInfoStatus');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      event.target.value = ''; status.textContent = 'The picture must be PNG, JPG or WebP and at most 2 MB.'; status.className = 'form-status error'; return;
    }
    avatarDataUrl = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
    renderPhotoPreview(); status.textContent = 'Preview ready; press Save to keep it.'; status.className = 'form-status';
  }

  async function savePersonal(event) {
    event.preventDefault(); const status = document.getElementById('profileInfoStatus'); const button = event.currentTarget.querySelector('[type=submit]');
    status.textContent = 'Saving…'; status.className = 'form-status'; button.disabled = true;
    try {
      const data = await post('/auth/profile', {
        displayName: document.getElementById('profileDisplayName').value, avatar: document.getElementById('profileAvatarInput').value,
        firstName: document.getElementById('profileFirstName').value, lastName: document.getElementById('profileLastName').value,
        phone: document.getElementById('profilePhone').value,
        address: document.getElementById('profileAddress').value, avatarDataUrl,
      });
      currentUser = data.user; avatarDataUrl = ''; render(); status.textContent = 'Profile saved.'; status.className = 'form-status success';
    } catch (error) { status.textContent = error.message; status.className = 'form-status error'; }
    finally { button.disabled = false; }
  }

  async function changePassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById('profilePasswordStatus'); const newPassword = document.getElementById('profileNewPassword').value;
    if (newPassword !== document.getElementById('profileConfirmPassword').value) { status.textContent = 'The confirmation does not match the new password.'; status.className = 'form-status error'; return; }
    const button = form.querySelector('[type=submit]'); button.disabled = true; status.textContent = 'Changing…'; status.className = 'form-status';
    try {
      await post('/auth/profile/password', { currentPassword: document.getElementById('profileCurrentPassword').value, newPassword });
      form.reset(); status.textContent = 'Password changed; other sessions were signed out.'; status.className = 'form-status success';
    } catch (error) { status.textContent = error.message; status.className = 'form-status error'; }
    finally { button.disabled = false; }
  }

  // A language saved on the account wins on a browser that has never chosen
  // one, so a new device opens in the user's own language straight away.
  function adoptAccountLanguage(user) {
    const i18n = window.SYC?.i18n;
    if (!i18n || !user?.language) return;
    let chosen = '';
    try { chosen = localStorage.getItem('syc-lang') || ''; } catch { /* private mode */ }
    if (!chosen && user.language !== i18n.lang) i18n.setLang(user.language);
  }

  window.SycProfile = {
    init(user) { currentUser = { ...user }; adoptAccountLanguage(user); mountAvatarMenu(); ensureModal(); render(); },
    open,
  };
})();
