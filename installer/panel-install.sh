#!/usr/bin/env bash
# Installs one professional account into a running SYC-AI installation.
# Called by the panel's "Install" button (as root) or by hand:
#
#   panel-install.sh <panelId> <package.tar.zst> [port]
#
# It extracts the account's app + CLI runtime into this installation, renders and
# starts its systemd service(s), and prints progress lines the panel streams to
# the progress bar. It never touches another installation or the OS outside the
# install root and /etc/systemd/system.
set -euo pipefail

PANEL_ID="${1:?panel id}"
PKG="${2:?package path}"
PORT="${3:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PREFIX="$(cat "$ROOT/data/install-prefix" 2>/dev/null || echo syc-ai)"

say() { echo "STEP $*"; }

say "verify package"
[ -f "$PKG" ] || { echo "ERR package not found: $PKG"; exit 1; }

say "extract $PANEL_ID"
tar --zstd -xf "$PKG" -C "$ROOT"

say "render service"
UNITS="$(node "$ROOT/installer/render-service.mjs" "$ROOT" "$PREFIX" "$PANEL_ID" "$PORT")"

say "enable service"
systemctl daemon-reload
for u in $UNITS; do systemctl enable "$u" >/dev/null 2>&1 || true; done

say "start service"
for u in $UNITS; do systemctl restart "$u"; done

# Mark installed so the panel shows it as active on next load.
mkdir -p "$ROOT/data"
grep -qxF "$PANEL_ID" "$ROOT/data/installed-panels" 2>/dev/null || echo "$PANEL_ID" >> "$ROOT/data/installed-panels"

say "done $PANEL_ID"
