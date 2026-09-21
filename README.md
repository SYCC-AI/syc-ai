<div align="center">

# SYC-AI

**A simpler control plane for AI accounts, agents, devices and automation.**

[![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-blue.svg)](LICENSE)
[![Languages](https://img.shields.io/badge/UI-6%20languages-brightgreen.svg)](#languages)
[![Platform](https://img.shields.io/badge/platform-Linux-informational.svg)](#requirements)

</div>

SYC is the parent brand; SYC-AI is its AI product. SYC-AI is being built as an
all-in-one control plane that makes AI accounts and infrastructure easier to
manage, better integrated and less wasteful.

> **Status:** local release candidate. No public install URL is available until
> the release configuration, security, history and legal reviews are complete
> and the owner explicitly approves publication.

## Verified in this release candidate

- Central account access with Gmail OTP sign-in, recovery and signed entitlements.
- Five visible plans, with only the launch plan (**Main**) selectable.
- Account profile, plan/upgrade view and owned support-ticket conversations.
- Signed installation/update metadata with rollback and data preservation.
- Repair, safe uninstall and migration from the earlier `syc-free` service.
- Restricted-mode access to the account and support areas.
- English, 中文, Español, العربية, Русский and فارسی interfaces.

The following are **not claimed as production-ready** in this candidate:
automatic production updates, Android/Windows/iPhone clients, bundled provider
runtimes, paid-plan checkout and live production email delivery.

## Installation model

The release installer is intentionally fail-closed. It requires:

- a signed release manifest and matching asset;
- the production release verification public key;
- the central entitlement verification public key;
- the HTTPS SYC-AI control URL and public origin.

It creates the service and preserves application data across verified upgrades.
Central authentication is used; the installer does not create a local admin
password. The final one-line install command will be added only after an exact
repository, branch, content and visibility are approved for publication.

### Requirements

- Linux with `systemd`
- Node.js 20 or newer
- `zstd`, `curl` and `tar`
- root access for service installation
- an HTTPS reverse proxy for non-local use

## Security model

- Release and entitlement documents are verified before use.
- Central sessions use secure cookies, CSRF protection, step-up checks and
  role-based authorization for administrative release operations.
- Sensitive runtime configuration is external to release archives and must be
  owner-readable only.
- Backup archives are authenticated and encrypted; restores retain the previous
  database and validate integrity before activation.
- Provider credentials and private signing keys must never be committed to this
  repository or included in release artifacts.

See [SECURITY.md](SECURITY.md) for the private-reporting policy. The public
reporting address must not be advertised until its end-to-end transport test has
passed.

## Professional capabilities

`Agent Surgery` is the advanced professional capability for controlled agent
inspection and intervention. It remains server-side and must not be advertised
as generally available until its complete production path is independently
verified.

## Operations

After installation, the local lifecycle tool supports:

```bash
sudo /opt/syc-ai/manage-installation.sh repair
sudo /opt/syc-ai/manage-installation.sh uninstall
```

Uninstall is recoverable: the installation is moved to a timestamped backup and
only the service units recorded by that installation are removed. User data is
not silently erased.

## Languages

English (default), 中文, Español, العربية, Русский and فارسی.

## License

SYC-AI is source-available under the Business Source License 1.1. Review the
exact use grant, additional-use terms and change-license parameters in
[LICENSE](LICENSE) before use or distribution. `SYC` and `SYC-AI` are trademarks
of SYC.
