#!/usr/bin/env bash
# SYC Node installer for Linux / macOS:  curl -fsSL https://syc-ai.com/node/install.sh | bash
#
# Installs the agent into ~/.syc-node, links `syc-node` into ~/.local/bin, and
# keeps the device connected (systemd service, or a background process + cron
# where there is no systemd). If Node.js 20+ is missing it downloads the
# official Node.js LTS into ~/.syc-node/node (checksum verified), so a fresh
# server needs nothing but curl and tar.
#
# Language: SYC_LANG=en|fa|ar|ru|zh|es (the per-language links on GitHub set
# it for you and the installer asks "English or <that language>").
# Run as root: SYC Node runs under a separate user "syc-node" (recommended);
# set SYC_NODE_ALLOW_ROOT=1 to run it as root instead.
set -euo pipefail
# Everything runs inside one block so bash reads the whole script before running
# it: with `curl … | bash`, a child that reads stdin would otherwise eat the rest.
{
SERVER="${SYC_SERVER:-https://syc-ai.com}"
DL="${SYC_DOWNLOAD:-$SERVER}"   # where the files come from (tests point this at a staging copy)
NODE_MIRRORS="${SYC_NODE_MIRROR:-https://nodejs.org/dist https://npmmirror.com/mirrors/node}"
LANG_DEFAULT="${SYC_LANG:-__SYC_LANG__}"
case "$LANG_DEFAULT" in en|fa|ar|ru|zh|es) ;; *) LANG_DEFAULT=en;; esac
L="$LANG_DEFAULT"

has_tty() { ( : < /dev/tty ) 2>/dev/null; }

# Messages (bash 3 compatible: no associative arrays, macOS ships bash 3.2).
m() {
  case "$L:$1" in
    fa:download) echo "در حال دریافت SYC Node از $SERVER …";;
    ar:download) echo "جارٍ تنزيل SYC Node من $SERVER …";;
    ru:download) echo "Загрузка SYC Node с $SERVER …";;
    zh:download) echo "正在从 $SERVER 下载 SYC Node …";;
    es:download) echo "Descargando SYC Node desde $SERVER …";;
    *:download) echo "Downloading SYC Node from $SERVER …";;
    fa:node) echo "Node.js نسخهٔ ۲۰ به بالا پیدا نشد؛ نسخهٔ رسمی LTS در ‎~/.syc-node/node‎ نصب می‌شود …";;
    ar:node) echo "لم يتم العثور على Node.js 20+؛ جارٍ تثبيت الإصدار الرسمي LTS في ~/.syc-node/node …";;
    ru:node) echo "Node.js 20+ не найден; устанавливаю официальный LTS в ~/.syc-node/node …";;
    zh:node) echo "未找到 Node.js 20+，正在把官方 LTS 安装到 ~/.syc-node/node …";;
    es:node) echo "No se encontró Node.js 20+; instalando el LTS oficial en ~/.syc-node/node …";;
    *:node) echo "Node.js 20+ not found; installing the official LTS into ~/.syc-node/node …";;
    fa:signin) echo "با حساب SYC-AI خود وارد شوید:";;
    ar:signin) echo "سجّل الدخول بحساب SYC-AI:";;
    ru:signin) echo "Войдите в свой аккаунт SYC-AI:";;
    zh:signin) echo "请登录你的 SYC-AI 账户：";;
    es:signin) echo "Inicia sesión con tu cuenta de SYC-AI:";;
    *:signin) echo "Sign in with your SYC-AI account:";;
    fa:later) echo "بعداً اجرا کنید: syc-node login";;
    ar:later) echo "شغّل لاحقًا: syc-node login";;
    ru:later) echo "Выполните позже: syc-node login";;
    zh:later) echo "稍后运行：syc-node login";;
    es:later) echo "Ejecuta más tarde: syc-node login";;
    *:later) echo "Run later: syc-node login";;
    fa:service) echo "SYC Node در پس‌زمینه اجرا می‌شود و بعد از راه‌اندازی مجدد هم وصل می‌ماند.";;
    ar:service) echo "يعمل SYC Node في الخلفية ويبقى متصلًا بعد إعادة التشغيل.";;
    ru:service) echo "SYC Node работает в фоне и остаётся подключённым после перезагрузки.";;
    zh:service) echo "SYC Node 已在后台运行，重启后仍会保持连接。";;
    es:service) echo "SYC Node se ejecuta en segundo plano y sigue conectado tras reiniciar.";;
    *:service) echo "SYC Node is running in the background and stays connected after a reboot.";;
    fa:done) echo "تمام شد. در پنل باز کنید: $SERVER/app/ ← دستگاه‌های من. برای حذف: syc-node uninstall";;
    ar:done) echo "تم. افتح $SERVER/app/ ← أجهزتي. للإزالة: syc-node uninstall";;
    ru:done) echo "Готово. Откройте $SERVER/app/ → Мои устройства. Удалить: syc-node uninstall";;
    zh:done) echo "完成。打开 $SERVER/app/ → 我的设备。卸载：syc-node uninstall";;
    es:done) echo "Listo. Abre $SERVER/app/ → Mis dispositivos. Para quitarlo: syc-node uninstall";;
    *:done) echo "Done. Open $SERVER/app/ → My devices. To remove it later: syc-node uninstall";;
    fa:root) echo "با root اجرا شده. SYC Node زیر یک کاربر جدا به نام syc-node اجرا شود (پیشنهادی) یا با root؟ [۱=کاربر جدا، ۲=root] ";;
    *:root) echo "Running as root. Run SYC Node as a separate user 'syc-node' (recommended) or as root? [1=separate user, 2=root] ";;
    fa:rootuser) echo "کاربر syc-node ساخته شد؛ SYC Node با همین کاربر اجرا می‌شود.";;
    *:rootuser) echo "Created user 'syc-node'; SYC Node runs as that user.";;
    *:needcurl) echo "curl and tar are required.";;
  esac
}
lang_name() {
  case "$1" in fa) echo "فارسی";; ar) echo "العربية";; ru) echo "Русский";; zh) echo "中文";; es) echo "Español";; *) echo "English";; esac
}
say() { printf '\033[1;36m» %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1 || die "$(m needcurl)"

# English, or the language of the page the command came from.
if [ "$LANG_DEFAULT" != en ] && [ -z "${SYC_LANG_FIXED:-}" ] && has_tty; then
  printf 'Language / %s:  1) English   2) %s   [2]: ' "$(lang_name "$LANG_DEFAULT")" "$(lang_name "$LANG_DEFAULT")"
  read -r answer < /dev/tty || answer=2
  case "${answer:-2}" in 1) L=en;; *) L="$LANG_DEFAULT";; esac
fi

# Root: hand the whole installation to a dedicated, unprivileged user.
if [ "$(id -u)" = 0 ] && [ "$(uname -s)" = Linux ] && [ "${SYC_NODE_ALLOW_ROOT:-}" != 1 ] && [ -z "${SYC_NODE_AS_USER:-}" ]; then
  choice=1
  if has_tty; then printf '%s' "$(m root)"; read -r choice < /dev/tty || choice=1; fi
  if [ "${choice:-1}" != 2 ]; then
    id syc-node >/dev/null 2>&1 || useradd --create-home --shell /bin/bash syc-node
    loginctl enable-linger syc-node >/dev/null 2>&1 || true
    say "$(m rootuser)"
    self=$(mktemp); curl -fsSL "$DL/node/install.sh" -o "$self"; chmod 755 "$self"
    # Re-run this installer as that user (with the terminal, so sign-in can ask).
    if has_tty; then
      su - syc-node -c "SYC_NODE_AS_USER=1 SYC_LANG_FIXED=1 SYC_LANG=$L SYC_SERVER=$SERVER SYC_DOWNLOAD=$DL bash $self" < /dev/tty
    else
      su - syc-node -c "SYC_NODE_AS_USER=1 SYC_LANG_FIXED=1 SYC_LANG=$L SYC_SERVER=$SERVER SYC_DOWNLOAD=$DL SYC_NODE_USER='${SYC_NODE_USER:-}' SYC_NODE_PASSWORD='${SYC_NODE_PASSWORD:-}' SYC_NODE_NAME='${SYC_NODE_NAME:-}' bash $self"
    fi
    rm -f "$self"
    # A system unit that runs as syc-node (works without a user session bus).
    if [ -f /home/syc-node/.syc-node/config.json ] && command -v systemctl >/dev/null 2>&1; then
      NODE_BIN=$(su - syc-node -c 'command -v node || echo $HOME/.syc-node/node/bin/node' | tail -1)
      [ -x /home/syc-node/.syc-node/node/bin/node ] && NODE_BIN=/home/syc-node/.syc-node/node/bin/node
      pkill -u syc-node -f "syc-node.mjs run" 2>/dev/null || true
      cat > /etc/systemd/system/syc-node.service <<UNIT
[Unit]
Description=SYC Node — keeps this device connected to SYC-AI
After=network-online.target
Wants=network-online.target

[Service]
User=syc-node
Environment=HOME=/home/syc-node
ExecStart=$NODE_BIN /home/syc-node/.syc-node/syc-node.mjs run
Restart=always
RestartSec=10
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT
      systemctl daemon-reload && systemctl enable --now syc-node.service >/dev/null 2>&1 && say "$(m service)"
      ln -sf /home/syc-node/.local/bin/syc-node /usr/local/bin/syc-node 2>/dev/null || true
    fi
    exit 0
  fi
fi

HOME_DIR="${SYC_NODE_HOME:-$HOME}/.syc-node"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$HOME_DIR" "$BIN_DIR"; chmod 700 "$HOME_DIR"

# Node.js 20+: use the system one, or install the official LTS privately.
NODE_BIN=""
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]; then
  NODE_BIN="$(command -v node)"
elif [ -x "$HOME_DIR/node/bin/node" ]; then
  NODE_BIN="$HOME_DIR/node/bin/node"
else
  say "$(m node)"
  case "$(uname -s)" in Linux) os=linux;; Darwin) os=darwin;; *) die "Unsupported system: $(uname -s)";; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64;; aarch64|arm64) arch=arm64;; armv7l) arch=armv7l;; *) die "Unsupported CPU: $(uname -m)";; esac
  ok=""
  for mirror in $NODE_MIRRORS; do
    sums=$(curl -fsSL --max-time 30 "$mirror/latest-v22.x/SHASUMS256.txt" 2>/dev/null) || continue
    file=$(printf '%s\n' "$sums" | awk -v f="-$os-$arch.tar.gz" '$2 ~ f"$" {print $2; exit}')
    want=$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f {print $1; exit}')
    [ -n "$file" ] && [ -n "$want" ] || continue
    tmp=$(mktemp -d)
    if curl -fsSL --max-time 600 "$mirror/latest-v22.x/$file" -o "$tmp/$file"; then
      got=$( (command -v sha256sum >/dev/null && sha256sum "$tmp/$file" || shasum -a 256 "$tmp/$file") | awk '{print $1}')
      if [ "$got" = "$want" ]; then
        rm -rf "$HOME_DIR/node"; mkdir -p "$HOME_DIR/node"
        tar -xzf "$tmp/$file" -C "$HOME_DIR/node" --strip-components=1 && ok=1
      fi
    fi
    rm -rf "$tmp"
    [ -n "$ok" ] && break
  done
  [ -n "$ok" ] || die "Could not download Node.js. Install Node.js 20+ (https://nodejs.org) and run this again."
  NODE_BIN="$HOME_DIR/node/bin/node"
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"

say "$(m download)"
curl -fsSL "$DL/node/syc-node.mjs" -o "$HOME_DIR/syc-node.mjs"
printf '#!/usr/bin/env bash\nexport PATH="%s:$PATH"\nexec "%s" "%s/syc-node.mjs" "$@"\n' "$(dirname "$NODE_BIN")" "$NODE_BIN" "$HOME_DIR" > "$BIN_DIR/syc-node"
chmod +x "$BIN_DIR/syc-node"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) say "Add $BIN_DIR to your PATH (e.g. in ~/.bashrc): export PATH=\"$BIN_DIR:\$PATH\"";; esac

if [ -f "$HOME_DIR/config.json" ] && "$BIN_DIR/syc-node" status 2>/dev/null | grep -q '^Connected'; then
  say "This device is already connected; keeping its token."
elif [ -n "${SYC_NODE_USER:-}" ]; then
  "$BIN_DIR/syc-node" login --server "$SERVER" --lang "$L" < /dev/null
elif has_tty; then
  say "$(m signin)"
  "$BIN_DIR/syc-node" login --server "$SERVER" --lang "$L" < /dev/tty
else
  say "$(m later)"
fi

start_background() {
  pkill -u "$(id -u)" -f "$HOME_DIR/syc-node.mjs run" 2>/dev/null || true
  nohup "$NODE_BIN" "$HOME_DIR/syc-node.mjs" run >>"$HOME_DIR/syc-node.log" 2>&1 &
  if command -v crontab >/dev/null 2>&1; then
    ( crontab -l 2>/dev/null | grep -v 'syc-node.mjs run'; echo "@reboot $NODE_BIN $HOME_DIR/syc-node.mjs run >>$HOME_DIR/syc-node.log 2>&1" ) | crontab - 2>/dev/null || true
  fi
  say "$(m service)"
}

if [ -n "${SYC_NODE_AS_USER:-}" ]; then
  : # the root part of this installer creates the system service
elif command -v systemctl >/dev/null 2>&1 && [ "$(uname -s)" = Linux ] && [ -f "$HOME_DIR/config.json" ]; then
  if [ "$(id -u)" = 0 ]; then
    cat > /etc/systemd/system/syc-node.service <<UNIT
[Unit]
Description=SYC Node — keeps this device connected to SYC-AI
After=network-online.target
Wants=network-online.target

[Service]
Environment=HOME=$HOME
ExecStart=$NODE_BIN $HOME_DIR/syc-node.mjs run
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload && systemctl enable --now syc-node.service >/dev/null 2>&1 \
      && say "$(m service)" \
      || say "Could not start the service; run in a terminal: syc-node run"
  else
    mkdir -p "$HOME/.config/systemd/user"
    cat > "$HOME/.config/systemd/user/syc-node.service" <<UNIT
[Unit]
Description=SYC Node — keeps this device connected to SYC-AI
After=network-online.target

[Service]
ExecStart=$NODE_BIN $HOME_DIR/syc-node.mjs run
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
UNIT
    if systemctl --user daemon-reload 2>/dev/null && systemctl --user enable --now syc-node.service 2>/dev/null; then
      loginctl enable-linger "$USER" >/dev/null 2>&1 || true
      say "$(m service)"
    else
      start_background
    fi
  fi
elif [ -f "$HOME_DIR/config.json" ]; then
  start_background
fi
say "$(m done)"
}
