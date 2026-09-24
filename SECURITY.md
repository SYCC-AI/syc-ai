# Security Policy

## Reporting a vulnerability

Please report security issues privately, never in a public issue:

- GitHub: [open a private security advisory](https://github.com/SYCC-AI/syc-ai/security/advisories/new), or
- email **syc@syc-ai.com**.

A report should include the affected version, environment, reproduction steps
and expected impact. Reporters should avoid public disclosure until a fix and
coordinated disclosure timeline are available.

## Scope

- The hosted panel at syc-ai.com / app.syc-ai.com and its account, session, plan and support flows.
- SYC Node (`node-agent/`): the agent on customer devices — its command and file policy, token handling, self-update and installers.
- The SYC-AI Android app (phone link, alerts, update check).
- The self-hosted panel: release installation, verification, repair, update and uninstall paths.
- Release and update signing (panel releases, SYC Node updates).

Provider CLIs (Claude Code, Codex, Gemini CLI, Cursor, Kimi) are third-party software and out of scope; report issues in them to their vendors.

We aim to acknowledge a report within 72 hours and to agree a disclosure timeline with you.

## Security expectations

- Run the panel behind an HTTPS reverse proxy outside localhost.
- Keep runtime configuration, database files, backup keys and signing keys out
  of the repository and readable only by their service owner.
- Use only a provider's permitted, official authorization flow; never give a
  provider password to SYC-AI.
- Do not describe analytics or telemetry as enabled until the exact transmitted
  fields, consent model, endpoint and retention policy have been verified.
- Treat every test-signed artifact as non-publishable.
