#!/usr/bin/env bash
# Repairs SYC-AI service definitions or safely uninstalls the application while
# preserving the complete installation as a recoverable backup.
set -euo pipefail

ACTION="${1:-status}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SYC_ROOT:-$(cd "$HERE/.." && pwd)}"
SYSTEMD_DIR="${SYC_SYSTEMD_DIR:-/etc/systemd/system}"
PREFIX="$(tr -d '\r\n' < "$ROOT/data/install-prefix" 2>/dev/null || true)"
MANAGED="$ROOT/data/managed-units"

die() { echo "ERR $*" >&2; exit 1; }
say() { echo "STEP $*"; }

[ "$(id -u)" = 0 ] || die "run as root"
case "$ROOT" in /*) ;; *) die "installation root must be absolute" ;; esac
[ "$ROOT" != / ] || die "refusing filesystem root"
[ -d "$ROOT/data" ] && [ -f "$ROOT/installer/panels.json" ] || die "SYC-AI installation not found"
[[ "$PREFIX" =~ ^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$ ]] || die "invalid service prefix"

valid_unit() {
  [[ "$1" =~ ^${PREFIX//./\.}(-[A-Za-z0-9._@-]+)?\.service$ ]]
}

read_units() {
  if [ -s "$MANAGED" ]; then
    while IFS= read -r unit; do
      valid_unit "$unit" || die "invalid managed unit record"
      printf '%s\n' "$unit"
    done < "$MANAGED"
  else
    printf '%s.service\n' "$PREFIX"
  fi
}

repair() {
  say "render core service"
  local pending="$ROOT/data/.managed-units.$$"
  : > "$pending"
  node "$ROOT/installer/render-service.mjs" "$ROOT" "$PREFIX" core >> "$pending"
  if [ -f "$ROOT/data/installed-panels" ]; then
    while IFS= read -r panel; do
      [ -n "$panel" ] || continue
      [[ "$panel" =~ ^[a-z0-9][a-z0-9-]{0,31}$ ]] || die "invalid installed panel record"
      say "render $panel service"
      node "$ROOT/installer/render-service.mjs" "$ROOT" "$PREFIX" "$panel" >> "$pending"
    done < "$ROOT/data/installed-panels"
  fi
  sort -u "$pending" -o "$pending"
  [ -s "$pending" ] || die "no service definitions rendered"
  while IFS= read -r unit; do valid_unit "$unit" || die "renderer returned an unsafe unit name"; done < "$pending"
  chmod 600 "$pending"
  mv "$pending" "$MANAGED"
  systemctl daemon-reload
  while IFS= read -r unit; do
    systemctl enable "$unit" >/dev/null 2>&1 || true
    systemctl restart "$unit"
    systemctl is-active --quiet "$unit" || die "$unit did not become active"
  done < "$MANAGED"
  say "repair complete; user data was not changed"
}

uninstall() {
  [ "${SYC_CONFIRM_UNINSTALL:-}" = 1 ] || die "set SYC_CONFIRM_UNINSTALL=1 to confirm safe uninstall"
  local backup="${SYC_UNINSTALL_BACKUP:-${ROOT}.uninstalled-$(date -u +%Y%m%dT%H%M%SZ)}"
  case "$backup" in /*) ;; *) die "backup path must be absolute" ;; esac
  [ "$backup" != / ] && [ "$backup" != "$ROOT" ] || die "unsafe backup path"
  case "$backup/" in "$ROOT/"*) die "backup path cannot be inside the installation" ;; esac
  [ ! -e "$backup" ] || die "backup path already exists"

  local units
  units="$(read_units)"
  while IFS= read -r unit; do
    [ -n "$unit" ] || continue
    systemctl stop "$unit" >/dev/null 2>&1 || true
    systemctl disable "$unit" >/dev/null 2>&1 || true
    [ ! -e "$SYSTEMD_DIR/$unit" ] || rm -- "$SYSTEMD_DIR/$unit"
  done <<< "$units"
  systemctl daemon-reload
  mv "$ROOT" "$backup"
  printf 'SAFE_BACKUP %s\n' "$backup"
  say "uninstall complete; all application data remains in the backup"
}

case "$ACTION" in
  repair) repair ;;
  uninstall) uninstall ;;
  *) die "usage: manage-installation.sh repair|uninstall" ;;
esac
