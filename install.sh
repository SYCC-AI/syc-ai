#!/usr/bin/env bash
# SYC-AI — self-hosted installer.
#
# The publication-specific one-line command and trusted endpoints are injected
# only after the release owner approves the exact repository and artifact set.
# Installs the signed package on this server, writes external onboarding
# configuration, creates the systemd service and starts the panel.
set -euo pipefail

SRC="${SYC_SRC:-}"
SOURCE="${SYC_SOURCE:-github}"                  # how they got the installer (github|direct)
FLAVOR="${SYC_FLAVOR:-core}"                    # core | full
ROOT="${SYC_ROOT:-/opt/syc-ai}"
LEGACY_ROOT="${SYC_LEGACY_ROOT:-/opt/syc-ai-free}"
LEGACY_PREFIX="${SYC_LEGACY_PREFIX:-syc-free}"
PORT="${SYC_PORT:-}"
PREFIX="${SYC_PREFIX:-syc-ai}"
CONTROL_URL="${SYC_CONTROL_URL:-}"
PUBLIC_ORIGIN="${SYC_PUBLIC_ORIGIN:-}"
NONINTERACTIVE="${SYC_YES:-}"

log()  { printf '\033[36m›\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "Node.js is required (v20+). Install it and re-run."
NODEMAJ="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODEMAJ" -ge 20 ] || die "Node.js 20+ required; found $(node -v)."
command -v systemctl >/dev/null || die "systemd is required."
command -v zstd >/dev/null || die "zstd is required (apt install zstd)."
command -v sha256sum >/dev/null || die "sha256sum is required."
[ "$(id -u)" = 0 ] || die "Run as root (needed to create a service)."

if [ -z "$NONINTERACTIVE" ]; then
  read -rp "Install directory [$ROOT]: " x; ROOT="${x:-$ROOT}"
  read -rp "Web port [random]: " PORT
  read -rp "Public HTTPS origin (for example https://ai.example.com): " PUBLIC_ORIGIN
fi
[ -n "$PORT" ] || PORT=$(( (RANDOM % 20000) + 20000 ))
[ -n "$SRC" ] || die "release source URL is required"
[ -n "$CONTROL_URL" ] || die "control URL is required for central onboarding configuration"
[ -n "${SYC_ENTITLEMENT_PUBLIC_KEY_B64:-}" ] || die "central onboarding configuration requires an entitlement verification key"
node - "$SRC" "$CONTROL_URL" "$PUBLIC_ORIGIN" "$SYC_ENTITLEMENT_PUBLIC_KEY_B64" "$ROOT" "$PREFIX" "$PORT" <<'NODE' || die "invalid release source, central onboarding configuration or public origin"
const { createPublicKey } = require('node:crypto');
const [source, control, product, keyB64, root, prefix, port] = process.argv.slice(2);
const validOrigin = (value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
};
const validSource = (value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
};
try {
  const key = createPublicKey(Buffer.from(keyB64, 'base64').toString('utf8'));
  if (!validSource(source) || !validOrigin(control) || !validOrigin(product) ||
      key.asymmetricKeyType !== 'ed25519' ||
      !/^\/[A-Za-z0-9._/-]+$/.test(root) || root === '/' || root.split('/').includes('..') ||
      !/^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$/.test(prefix) ||
      !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) process.exit(2);
} catch { process.exit(2); }
NODE

log "Downloading $FLAVOR package from $SRC …"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
STAGE="$TMP/stage"
PREVIOUS="$TMP/previous"
mkdir -p "$STAGE" "$(dirname "$ROOT")"
MIGRATING=0
if [ ! -e "$ROOT" ] && [ "$LEGACY_ROOT" != "$ROOT" ] && [ -d "$LEGACY_ROOT/data" ]; then
  MIGRATING=1
  log "Legacy installation found; its data will be copied and the old service retained as a backup."
fi
curl -fsSL "$SRC/manifest.json" -o "$TMP/manifest.json" || die "cannot reach $SRC"
curl -fsSL "$SRC/manifest.sig" -o "$TMP/manifest.sig" || die "cannot download release signature"
[ -n "${SYC_RELEASE_PUBLIC_KEY_B64:-}" ] || die "release verification key is required"
case "$FLAVOR" in core|full) ;; *) die "unknown installation flavor: $FLAVOR" ;; esac
IFS=$'\t' read -r PKG EXPECTED_BYTES EXPECTED_SHA RELEASE_VERSION < <(
  node - "$TMP/manifest.json" "$TMP/manifest.sig" "$SYC_RELEASE_PUBLIC_KEY_B64" "$FLAVOR" <<'NODE'
const fs = require('node:fs');
const { verify, createPublicKey } = require('node:crypto');
const [manifestPath, signaturePath, publicKeyB64, flavor] = process.argv.slice(2);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const signature = fs.readFileSync(signaturePath, 'utf8').trim();
  const publicKey = createPublicKey(Buffer.from(publicKeyB64, 'base64').toString('utf8'));
  if (!verify(null, Buffer.from(canonical(manifest)), publicKey, Buffer.from(signature, 'base64url')) ||
      manifest.schema !== 1 || !Number.isSafeInteger(manifest.sequence) || manifest.sequence < 1 ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version || '') ||
      Date.parse(manifest.expiresAt) <= Date.now() || !['optional','required','emergency'].includes(manifest.mode)) process.exit(3);
  const entry = manifest.assets?.[flavor];
  if (!entry || !/^[A-Za-z0-9._-]+$/.test(entry.file || '') ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) process.exit(2);
  process.stdout.write(`${entry.file}\t${entry.bytes}\t${entry.sha256}\t${manifest.version}\n`);
} catch { process.exit(2); }
NODE
) || die "invalid release manifest"
[ -n "$PKG" ] && [ -n "$EXPECTED_BYTES" ] && [ -n "$EXPECTED_SHA" ] && [ -n "$RELEASE_VERSION" ] || die "invalid release manifest"
curl -fSL "$SRC/$PKG" -o "$TMP/package.tar.zst" || die "download failed"

log "Verifying package integrity …"
ACTUAL_BYTES="$(wc -c < "$TMP/package.tar.zst" | tr -d '[:space:]')"
[ "$ACTUAL_BYTES" = "$EXPECTED_BYTES" ] || die "package integrity check failed: size mismatch"
ACTUAL_SHA="$(sha256sum "$TMP/package.tar.zst" | awk '{print $1}')"
[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || die "package integrity check failed: SHA-256 mismatch"

log "Extracting to a staging directory …"
tar --zstd -xf "$TMP/package.tar.zst" -C "$STAGE"

log "Configuring …"
mkdir -p "$STAGE/data"
if [ -d "$ROOT/data" ]; then
  cp -a "$ROOT/data/." "$STAGE/data/"
elif [ "$MIGRATING" = 1 ]; then
  cp -a "$LEGACY_ROOT/data/." "$STAGE/data/"
fi
echo "$PREFIX" > "$STAGE/data/install-prefix"
# Signed package source used by the in-panel professional-account installer.
node - "$STAGE/data/release.json" "$SRC" "$FLAVOR" "$SOURCE" <<'NODE'
const { writeFileSync } = require('node:fs');
const [path, source, flavor, channel] = process.argv.slice(2);
writeFileSync(path, `${JSON.stringify({ source, flavor, channel })}\n`, { mode: 0o600 });
NODE
node - "$STAGE/data/entitlement-public.pem" "$SYC_ENTITLEMENT_PUBLIC_KEY_B64" "$STAGE/data/release-public.pem" "$SYC_RELEASE_PUBLIC_KEY_B64" <<'NODE'
const { writeFileSync } = require('node:fs');
const [entitlementPath, entitlementEncoded, releasePath, releaseEncoded] = process.argv.slice(2);
writeFileSync(entitlementPath, Buffer.from(entitlementEncoded, 'base64').toString('utf8'), { mode: 0o600 });
writeFileSync(releasePath, Buffer.from(releaseEncoded, 'base64').toString('utf8'), { mode: 0o600 });
NODE
cat > "$STAGE/data/runtime.env" <<ENV
SYC_AI_CONTROL_URL=$CONTROL_URL
SYC_AI_PUBLIC_ORIGIN=$PUBLIC_ORIGIN
SYC_AI_ENTITLEMENT_PUBLIC_KEY_FILE=$ROOT/data/entitlement-public.pem
SYC_AI_RELEASE_PUBLIC_KEY_FILE=$ROOT/data/release-public.pem
SYC_AI_VERSION=$RELEASE_VERSION
ENV
chmod 600 "$STAGE/data/runtime.env"

# If the full bundle was installed, its accounts are already present.
if [ "$FLAVOR" = full ]; then
  node -e 'const m=require("'"$STAGE"'/installer/panels.json");for(const id of m.bundled)require("fs").appendFileSync("'"$STAGE"'/data/installed-panels",id+"\n")'
fi

log "Switching atomically and starting the panel …"
HAD_PREVIOUS=0
if [ -e "$ROOT" ]; then mv "$ROOT" "$PREVIOUS"; HAD_PREVIOUS=1; fi
mv "$STAGE" "$ROOT"
if [ "$MIGRATING" = 1 ]; then
  systemctl stop "$LEGACY_PREFIX" >/dev/null 2>&1 || true
fi
ACTIVATION_OK=1
MANAGED_TMP="$ROOT/data/.managed-units.$$"
: > "$MANAGED_TMP"
node "$ROOT/installer/render-service.mjs" "$ROOT" "$PREFIX" core "$PORT" >> "$MANAGED_TMP" || ACTIVATION_OK=0
if [ "$FLAVOR" = full ]; then
  for id in $(node -p 'require("'"$ROOT"'/installer/panels.json").bundled.join(" ")'); do
    node "$ROOT/installer/render-service.mjs" "$ROOT" "$PREFIX" "$id" >> "$MANAGED_TMP" || ACTIVATION_OK=0
  done
fi
sort -u "$MANAGED_TMP" -o "$MANAGED_TMP"
while IFS= read -r unit; do
  case "$unit" in
    "$PREFIX.service"|"$PREFIX-"*.service) ;;
    *) ACTIVATION_OK=0 ;;
  esac
done < "$MANAGED_TMP"
systemctl daemon-reload || ACTIVATION_OK=0
systemctl enable "$PREFIX" >/dev/null 2>&1 || true
systemctl restart "$PREFIX" || ACTIVATION_OK=0
systemctl is-active --quiet "$PREFIX" || ACTIVATION_OK=0
if [ "$ACTIVATION_OK" != 1 ]; then
  systemctl stop "$PREFIX" >/dev/null 2>&1 || true
  mv "$ROOT" "$TMP/failed"
  if [ "$HAD_PREVIOUS" = 1 ]; then
    mv "$PREVIOUS" "$ROOT"
    systemctl daemon-reload >/dev/null 2>&1 || true
    systemctl restart "$PREFIX" >/dev/null 2>&1 || true
  fi
  if [ "$MIGRATING" = 1 ]; then systemctl restart "$LEGACY_PREFIX" >/dev/null 2>&1 || true; fi
  die "activation failed; the previous installation was restored"
fi
chmod 600 "$MANAGED_TMP"
mv "$MANAGED_TMP" "$ROOT/data/managed-units"
if [ "$MIGRATING" = 1 ]; then systemctl disable "$LEGACY_PREFIX" >/dev/null 2>&1 || true; fi
if [ "$FLAVOR" = full ]; then systemctl restart "$PREFIX-claude" "$PREFIX-codex" 2>/dev/null || true; fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
printf '\n\033[32m✓ SYC-AI is installed.\033[0m\n'
printf '  URL:      http://%s:%s\n' "${IP:-your-server}" "$PORT"
printf '  Service:  %s\n' "$PREFIX"
printf '  Put it behind HTTPS (a reverse proxy) before real use.\n\n'
