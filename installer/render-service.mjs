#!/usr/bin/env node
// Renders systemd unit files for the core panel or one professional account,
// from installer/panels.json, for THIS installation's root and service prefix.
// Used by install.sh (core) and panel-install.sh (a downloaded account).
//
//   node render-service.mjs <root> <prefix> core [port]
//   node render-service.mjs <root> <prefix> <panelId> [port]
//
// It writes to /etc/systemd/system/<prefix>[-<suffix>].service and prints the
// unit names it wrote (one per line). No paths to our own machine ever appear:
// every path is derived from <root>, and the sandbox only protects the OS.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const reg = JSON.parse(readFileSync(join(HERE, 'panels.json'), 'utf8'));
const [root, prefix, target, portArg] = process.argv.slice(2);
if (!root || !prefix || !target) {
  console.error('usage: render-service.mjs <root> <prefix> <core|panelId> [port]');
  process.exit(2);
}

const subst = (v) => String(v).replaceAll('$ROOT', root);
const SYSTEMD = process.env.SYC_SYSTEMD_DIR || '/etc/systemd/system';

function unit({ desc, workdir, entry, env, mem, port, canInstall, environmentFile }) {
  const workAbs = workdir === '.' ? root : join(root, workdir);
  // systemd changes to WorkingDirectory before exec, so it must exist first.
  // Data dirs live under the writable data/ tree; create the whole path.
  mkdirSync(workAbs, { recursive: true });
  const lines = [
    '[Unit]', `Description=${desc}`, 'After=network-online.target', 'Wants=network-online.target', '',
    '[Service]', 'Type=simple', 'User=root',
    `WorkingDirectory=${workAbs}`,
  ];
  for (const [k, val] of Object.entries(env)) {
    lines.push(`Environment=${k}=${subst(val).replace('$PORT', String(port))}`);
  }
  if (environmentFile) lines.push(`EnvironmentFile=-${environmentFile}`);
  // The core panel installs the professional accounts into this install root and
  // starts them, so it (and only it) may write the whole install root and its
  // own unit files and drive systemctl. Every other service can write only its
  // data and keeps the rest of the disk read-only.
  // The core panel replaces its own tree when a release is forced on it, and
  // that swap is two renames inside the parent directory — so the parent has
  // to be writable or every forced update dies with EROFS. Provider panels get
  // their data directory and nothing else.
  const rwx = canInstall ? `${dirname(root)} ${root} /etc/systemd/system` : join(root, 'data');
  lines.push(
    `ExecStart=/usr/bin/node ${join(root, entry)}`,
    'Restart=always', 'RestartSec=3', 'UMask=0077',
    'NoNewPrivileges=true', 'PrivateTmp=true',
    'ProtectSystem=strict', 'ProtectHome=read-only',
    `ReadWritePaths=${rwx}`,
    'ProtectKernelTunables=true', 'ProtectKernelModules=true', 'ProtectControlGroups=true',
    'RestrictSUIDSGID=true', 'LockPersonality=true',
    'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
    `MemoryMax=${mem}`, 'TasksMax=512', 'KillMode=mixed', 'TimeoutStopSec=60', '',
    '[Install]', 'WantedBy=multi-user.target', '',
  );
  return lines.join('\n');
}

const written = [];
function write(name, text) {
  writeFileSync(join(SYSTEMD, `${name}.service`), text, { mode: 0o644 });
  written.push(`${name}.service`);
}

if (target === 'core') {
  const port = portArg || reg.core.port;
  write(prefix, unit({
    desc: `${reg.product} — core panel`, workdir: reg.core.workdir,
    entry: reg.core.entry, env: reg.core.env, mem: '256M', port, canInstall: true,
    environmentFile: join(root, 'data', 'runtime.env'),
  }));
} else {
  const p = reg.panels[target];
  if (!p) { console.error(`unknown panel: ${target}`); process.exit(2); }
  const port = portArg || p.port;
  for (const svc of p.services) {
    const name = svc.suffix === target ? `${prefix}-${target}` : `${prefix}-${svc.suffix}`;
    write(name, unit({
      desc: `${reg.product} — ${p.name}${svc.suffix === target ? '' : ' (' + svc.suffix + ')'}`,
      workdir: svc.workdir, entry: svc.entry,
      env: svc.env || p.env, mem: svc.mem || '2G', port,
    }));
  }
}
console.log(written.join('\n'));
