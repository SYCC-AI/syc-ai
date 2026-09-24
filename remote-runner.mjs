// Remote runner — runs a CLI on the customer's own device through the SYC-AI
// device hub instead of on this server (hybrid model, 2026-09-22).
//
// `spawn()` returns synchronously with a ChildProcess-shaped object so the
// panel's existing code (stdout 'data', 'close', stdin.write, kill, exitCode,
// killed) keeps working unchanged. The actual work — pushing the prepared
// files to the device, asking the hub to spawn, subscribing to the process
// event stream — happens asynchronously behind it; stdin written before the
// process exists is buffered and flushed in order.
import { EventEmitter } from 'node:events';

const HUB_BASE = process.env.SYC_HUB_BASE || 'http://127.0.0.1:8798';
const HUB_SECRET = process.env.SYC_HUB_SECRET || '';

const headers = (extra = {}) => ({ ...(HUB_SECRET ? { 'x-syc-hub': HUB_SECRET } : {}), ...extra });

async function hubJson(path, body) {
  const response = await fetch(`${HUB_BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: headers(body === undefined ? {} : { 'content-type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.error || `hub_http_${response.status}`), { status: response.status });
  return value.data;
}

export async function hubDevices() { return hubJson('/internal/hub/devices'); }
export async function hubDevice(deviceId) { return (await hubDevices()).find((d) => d.deviceId === deviceId) || null; }

// Small file operations on the device. Paths may start with `~/`; the agent expands them.
export const deviceFs = {
  read: (deviceId, path) => hubJson(`/internal/hub/devices/${deviceId}/fs`, { op: 'read', path }).then((r) => r?.data ?? ''),
  write: (deviceId, path, data) => hubJson(`/internal/hub/devices/${deviceId}/fs`, { op: 'write', path, data }),
  append: (deviceId, path, data) => hubJson(`/internal/hub/devices/${deviceId}/fs`, { op: 'append', path, data }),
  mkdir: (deviceId, path) => hubJson(`/internal/hub/devices/${deviceId}/fs`, { op: 'mkdir', path }),
  rm: (deviceId, path) => hubJson(`/internal/hub/devices/${deviceId}/fs`, { op: 'rm', path, recursive: true }),
  list: (deviceId, path) => hubJson(`/internal/hub/devices/${deviceId}/fs`, { op: 'list', path }),
};

class RemoteChild extends EventEmitter {
  constructor(deviceId) {
    super();
    this.remote = true;
    this.deviceId = deviceId;
    this.procId = null;
    // -1 until the device reports the real pid: panels test `child.pid` for
    // liveness before deciding whether to terminate a child.
    this.pid = -1;
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    // setEncoding('utf8') → emit strings, like a real ChildProcess stream.
    this.stdout.setEncoding = (enc) => { this.stdout._enc = enc; };
    this.stderr.setEncoding = (enc) => { this.stderr._enc = enc; };
    this._stdinQueue = [];
    this._stdinEnded = false;
    this._pendingKill = null;
    this._abort = new AbortController();
    const child = this;
    this.stdin = {
      write(data, callback) {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        if (child.procId) child._send('stdin', { data: text }).then(() => callback?.(), (e) => callback?.(e));
        else child._stdinQueue.push(text);
        return true;
      },
      end(data) {
        if (data != null) this.write(data);
        if (child.procId) child._send('stdin', { end: true });
        else child._stdinEnded = true;
      },
      on() { return this; },
      once() { return this; },
      destroy() {},
      destroyed: false,
      writable: true,
    };
  }

  async _send(op, body) {
    if (!this.procId) return;
    try { await hubJson(`/internal/hub/procs/${this.procId}/${op}`, body); } catch { /* process already gone */ }
  }

  kill(signal = 'SIGTERM') {
    this.killed = true;
    if (this.procId) this._send('kill', { signal });
    else this._pendingKill = signal;
    return true;
  }

  _finish(exit) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = exit.code ?? null;
    this.signalCode = exit.signal ?? null;
    this._abort.abort();
    this.emit('exit', this.exitCode, this.signalCode);
    this.emit('close', this.exitCode, this.signalCode);
  }

  async _start({ bin, args, cwd, env, prepare = [], timeoutMs }) {
    try {
      for (const file of prepare) await deviceFs.write(this.deviceId, file.path, file.content);
      const { procId } = await hubJson(`/internal/hub/devices/${this.deviceId}/spawn`, { bin, args, cwd, env, timeoutMs });
      this.procId = procId;
      if (this._pendingKill) { await this._send('kill', { signal: this._pendingKill }); }
      for (const text of this._stdinQueue) await this._send('stdin', { data: text });
      this._stdinQueue = [];
      if (this._stdinEnded) await this._send('stdin', { end: true });
      await this._follow();
    } catch (error) {
      // Remembered so the panel can tell the customer "your device is offline"
      // instead of treating this like a crash worth recovering from.
      this.spawnError = error.message || 'remote_spawn_failed';
      if (this.listenerCount('error')) this.emit('error', error);
      this._finish({ code: null, signal: 'ERROR' });
    }
  }

  async _follow() {
    const response = await fetch(`${HUB_BASE}/internal/hub/procs/${this.procId}/events`, { headers: headers(), signal: this._abort.signal });
    if (!response.ok || !response.body) throw new Error(`hub_events_${response.status}`);
    const decoder = new TextDecoder(); let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        let event = ''; let data = '';
        for (const line of block.split('\n')) { if (line.startsWith('event: ')) event = line.slice(7); else if (line.startsWith('data: ')) data += line.slice(6); }
        if (!event || !data) continue;
        let payload; try { payload = JSON.parse(data); } catch { continue; }
        if (event === 'spawned') { this.pid = payload.pid; this.emit('spawn'); }
        else if (event === 'stdout') this.stdout.emit('data', this.stdout._enc ? String(payload.data || '') : Buffer.from(String(payload.data || ''), 'utf8'));
        else if (event === 'stderr') this.stderr.emit('data', this.stderr._enc ? String(payload.data || '') : Buffer.from(String(payload.data || ''), 'utf8'));
        else if (event === 'error') this.emit('error', new Error(payload.message || 'remote_error'));
        else if (event === 'exit') { this._finish(payload); return; }
      }
    }
    this._finish({ code: null, signal: 'STREAM_CLOSED' });
  }
}

// Spawn `bin args` on the device. `prepare` is a list of {path, content}
// written to the device before the process starts (settings, hook scripts).
export function spawnOnDevice(deviceId, { bin, args = [], cwd, env, prepare = [], timeoutMs } = {}) {
  const child = new RemoteChild(deviceId);
  queueMicrotask(() => { child._start({ bin, args, cwd, env, prepare, timeoutMs }); });
  return child;
}

// Tell the signed-in user's phone that a session needs them — an approval to
// give, a long task that finished. Only when the user switched "Agent alerts"
// on (Connection → Android); the control plane enforces that and de-duplicates.
// Best effort: never throws and never delays the session.
export function phoneAlert(title, body = '') {
  const username = process.env.SYC_TENANT_USER;
  if (!username) return;
  hubJson('/internal/hub/alerts', { username, title: String(title).slice(0, 120), body: String(body).slice(0, 600) }).catch(() => {});
}
