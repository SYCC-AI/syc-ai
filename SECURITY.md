# Security Policy

## Reporting a vulnerability

Please report security issues privately, not in public issues.

The intended public contact is `syc@sycc.ir`, but it must not be advertised as
operational until end-to-end SMTP and IMAP transport verification passes and the
result is recorded. Until then, publication remains locked and no public
security-reporting promise should be made.

A report should include the affected version, environment, reproduction steps
and expected impact. Reporters should avoid public disclosure until a fix and
coordinated disclosure timeline are available.

## Scope

- The self-hosted panel and its central account integration.
- Release installation, verification, repair, update and uninstall paths.
- Central authentication, entitlements, support and release administration.
- Encrypted database backup and restore.

Android, Windows and iPhone clients and bundled provider runtimes are not in the
verified scope of this release candidate.

## Security expectations

- Run the panel behind an HTTPS reverse proxy outside localhost.
- Keep runtime configuration, database files, backup keys and signing keys out
  of the repository and readable only by their service owner.
- Use only a provider's permitted, official authorization flow; never give a
  provider password to SYC-AI.
- Do not describe analytics or telemetry as enabled until the exact transmitted
  fields, consent model, endpoint and retention policy have been verified.
- Treat every test-signed artifact as non-publishable.
