# Changelog

Signed releases and their assets: [Releases](https://github.com/SYCC-AI/syc-ai/releases).

## 0.7.4 — 2026-09-24
- **Sign in with Google or GitHub.** New people pick a username and a password once (SYC Node on your computers signs in with them); an existing account with the same Gmail simply signs in. SYC-AI accounts stay Gmail-based: GitHub needs a verified Gmail on the account.
- **SYC Node 0.7.3:** the events of one program reach the panel in order. Before, a program's exit could overtake its last output — on Windows the panel then showed "device not answering" for Codex. Output that waits behind a slow connection is sent as one piece. Devices update themselves.
- The operator console signs in with a second factor and shows how much of the daily e-mail quota is used.
- Verified on Windows Server 2019: one-line install, Claude Code and Codex installed by the installer, both detected by the panel, clean `syc-node uninstall`.

## 0.7.3 — 2026-09-24
- **Token doctor** (Claude Web → Usage reports → Token doctor): cache hits this week, long conversations whose cache has expired, the fixed part of every question, compression line, sign-in and stopped answers — plain advice in six languages, computed without asking a model.
- **Cold-conversation warning** in Claude Web and Codex Web: returning to a long conversation after an hour or more offers a new conversation, since the next message would re-read the whole memory at full price. The choice stays yours.
- **Installers**: after sign-in, the Linux/macOS and Windows one-line installers offer to install Claude Code and Codex too (`SYC_NODE_CLIS=yes|no` for unattended installs).
- **Home page**: five cards — Professional monthly accounts, Connect your phone, Communications, Connect to Windows and Linux, Simulators — a first-visit guide, and a visual **Guide** page with real screenshots and answers to common questions.
- **Profile**: time left on your plan, privacy and account deletion request, payment methods, tickets in three topics (technical, financial, suggestions).
- **Protection of SYC-AI's own files on your device**: agents refuse to read or change SYC Node's panel, accounts and configuration, in every permission mode, and such attempts are reported.
- Editions show their monthly price; announcements and payment methods come in your language.
- Fixes: Codex Web opened unstyled in Persian and Arabic; composer placeholders were not translated; clearer English throughout Claude Web.

## 0.7.2 — 2026-09-24
- **SYC-AI — All in One**: a new professional account. One session, one project folder and one shared memory (AGENTS.md) for Claude and Codex on your device. Each message goes to the engine that suits it (planning → Claude, building → Codex, short questions → a lighter model), or the one you pick. When one subscription reaches its limit, the same message continues with the next engine in your order; an engine that joins or comes back gets a short handoff of what it missed.
- Usage of every connected account in one place (5-hour window and week, with reset times), read without sending anything to a model.
- Settings in five tabs: engines and order, answers, memory, permissions (read only / work in the project / full access), skills and tools.
- Token saver on by default, with credited MIT skills: Caveman (Julius Brussee) and three Superpowers skills (Jesse Vincent), pinned and shipped with their licenses.
- Specialized sessions behind the yellow **+**: website builder, bug fixer, code reviewer, research assistant, writer and translator, data analyst, beginner coach, game maker — each downloadable as an AGENTS.md.
- A second Claude or Codex account per device (personal and work), chosen by you per engine; SYC-AI never switches accounts on its own. Needs SYC Node 0.7.1 (devices update themselves).
- Professional accounts: new order, the SYC-AI card, and twelve "coming to SYC-AI" boxes.
- Change your password from inside the panel.

## 0.7.1 — 2026-09-24 (optional)
- Sign-in page: one-click language row.
- Communications page in the new look (Telegram, WhatsApp, Instagram, TikTok and YouTube marked *Coming soon*).
- Claude on the hosted panel: the *Runs on* label shows your device (never "This server"); the empty screen points at *Runs on*.
- Codex: when Codex is not installed on the chosen device yet, the panel tries once a minute instead of restarting over and over.

## 0.7.0 — 2026-09-24
- **All You Need With AI — In One.** A new look for every page: the sign-in page, the home page with a "get going" checklist, and the professional accounts page with twelve feature boxes around the accounts. Calm by design: no blinking, no counters.
- **Phone alerts:** your phone tells you when an agent is waiting for your OK or when a long task has finished (*Connection → Android → Agent alerts*; off until you switch it on).
- **SYC Node 0.7.0** (the agent on your computer): runs only the AI CLIs and their npm installs, reads and writes only inside `~/.syc-node`, drops environment variables that could redirect a CLI, logs every request (`syc-node log`), and adds `pause`, `resume` and `uninstall`. The installer now adds Node.js when it is missing, speaks six languages, and runs as a separate `syc-node` user when started as root.
- **Busy days:** the panel keeps a ceiling on running workspaces; the longest-idle one makes room, and when every slot is busy a newcomer sees a friendly "try again in a minute" page instead of an error.
- **Shared addresses:** sign-up codes and sign-ups are limited per person, with a larger allowance per address, so people behind the same VPN or office network no longer block each other.
- **Language links:** `app.syc-ai.com/login?lang=fa` (and zh, es, ar, ru) opens the panel in that language; a first visit offers "English or your language".
- **Upgrade page:** every edition with its status; paid editions show a disabled upgrade button and the payment methods that open with them (USDT, card, PayPal).
- A thank-you to our first 1,000 members, with an optional GitHub star link.
- Security: a suspended account's devices are refused, and a password reset disconnects every device.

## 0.6.1 — 2026-09-23
- **One Android app:** SYC-AI for Android is the panel on your phone and also links the phone to your account (*Connection → Android → Connect this phone*) — no second app, no second password, no Accessibility permission.
- **Agents can hand your phone a notification, a link or a piece of text.** Each kind is off until you switch it on; links are marked as risky; nothing opens until you tap it; the server refuses anything that is off.
- **Four ways in:** web, Android, Linux and desktop (install the panel as an app from Chrome or Edge) — *Connection → Get SYC-AI*.
- **Central updates:** SYC Node updates itself with release-key-signed builds; the Android app offers new versions; web and desktop follow the panel.
- New sign-in page: larger logo, icons, show-password, compact account links.
- Sign-in rate limits now count per address *and* username, so people sharing a VPN or office address no longer lock each other out.

## 0.6.0 — 2026-09-23
- Use SYC-AI at [syc-ai.com](https://syc-ai.com) without a server: sign up, activate Main, connect your computer with SYC Node.
- Professional accounts install and sign in Claude and Codex **on your device** from the panel.
- Hosted guard: the hosted panel never runs a shell or CLI on its own server.

## 0.5.8 — 2026-09-22
- The Claude account behaves like the terminal CLI (permissions, compaction, tools, connectors, plugins).

## 0.5.7 — 2026-09-22
- Leaner Claude requests; context-window setting.

## 0.5.6 — 2026-09-22
- Account updates; full-install fix.

## 0.5.5 / 0.5.4 — 2026-09-22
- Entitlement lease renewal fixed, so panels stay unlocked past six hours.

## 0.5.3 — 2026-09-22
- First public release: Main, free during launch; signed releases; Android phone connector; six interface languages.
