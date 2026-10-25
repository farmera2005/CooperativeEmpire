// Cloudflare Tunnel manager for the local game server (D-123). Runs one cloudflared process in
// front of the server the player is using, remembers the tunnel settings in a git-ignored file,
// and reports status for the Settings screen and `npm run share`.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type TunnelMode = 'quick' | 'named';

export interface TunnelConfig {
  mode: TunnelMode;
  /** Named tunnel token (kept on this machine only; never sent back to the browser). */
  token: string;
  /** Public hostname routed to the named tunnel, for display and Vite's host allowance. */
  hostname: string;
  /** Start the tunnel when the game server starts. */
  autoStart: boolean;
  /** Key the Settings screen needs when opened from another machine (D-126); never sent to a browser. */
  adminKey?: string;
}

export interface TunnelStatus {
  state: 'stopped' | 'starting' | 'running' | 'error';
  url: string | null;
  error: string | null;
  /** cloudflared version, or null when it is not installed. */
  cloudflared: string | null;
  /** Saved settings, with the token masked. */
  config: Omit<TunnelConfig, 'token'> & { tokenSet: boolean; tokenHint: string; tokenFromEnv: boolean };
  /** Last lines of cloudflared's log. */
  log: string[];
  startedAt: number | null;
  localUrl: string | null;
}

/** Where the settings live: .tunnel.json in the project (git-ignored), or TUNNEL_CONFIG_FILE. */
export const configFile = (): string => process.env.TUNNEL_CONFIG_FILE ?? resolve(process.cwd(), '.tunnel.json');
const DEFAULTS: TunnelConfig = { mode: 'quick', token: '', hostname: '', autoStart: false };
const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export function loadConfig(): TunnelConfig {
  let saved: Partial<TunnelConfig> = {};
  try {
    if (existsSync(configFile())) saved = JSON.parse(readFileSync(configFile(), 'utf8'));
  } catch { /* unreadable: use defaults */ }
  const cfg = { ...DEFAULTS, ...saved };
  if (!cfg.hostname && process.env.TUNNEL_HOSTNAME) cfg.hostname = process.env.TUNNEL_HOSTNAME;
  return cfg;
}

export function saveConfig(patch: Partial<TunnelConfig>): TunnelConfig {
  const next = { ...loadConfig(), ...patch };
  next.mode = next.mode === 'named' ? 'named' : 'quick';
  next.hostname = String(next.hostname ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  next.token = String(next.token ?? '').trim();
  next.autoStart = !!next.autoStart;
  if (!next.adminKey) delete next.adminKey;
  writeFileSync(configFile(), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  try { chmodSync(configFile(), 0o600); } catch { /* not supported on this platform */ }
  return next;
}

/**
 * The sharing key for other machines (D-126): COOP_ADMIN_KEY if set, otherwise a random key made
 * once and kept with the tunnel settings, so it survives restarts (in Docker, in the volume).
 */
export function adminKey(): string {
  if (process.env.COOP_ADMIN_KEY) return process.env.COOP_ADMIN_KEY;
  const cfg = loadConfig();
  if (cfg.adminKey) return cfg.adminKey;
  R.memoryKey ??= randomBytes(18).toString('base64url');
  try {
    saveConfig({ adminKey: R.memoryKey });
  } catch (e) {
    // The settings folder is not writable: keep the key for this run so the game still serves.
    if (!R.warnedKeyFile) console.warn(`Could not save the sharing key to ${configFile()} (${(e as Error).message}); it changes each restart until the folder is writable.`);
    R.warnedKeyFile = true;
  }
  return R.memoryKey;
}

/** The token in use: the saved one, or CLOUDFLARE_TUNNEL_TOKEN from the environment. */
const tokenOf = (cfg: TunnelConfig) => cfg.token || process.env.CLOUDFLARE_TUNNEL_TOKEN || '';

interface Runtime {
  child: ChildProcess | null;
  state: TunnelStatus['state'];
  url: string | null;
  error: string | null;
  startedAt: number | null;
  localUrl: string | null;
  log: string[];
  versionCache: { at: number; v: string | null } | null;
  exitHooked: boolean;
  memoryKey?: string;
  warnedKeyFile?: boolean;
}
// One tunnel per process. Vite loads its config (and this module) as a separate bundle, so the
// state lives on globalThis for `npm run share` and the Settings API to see the same tunnel.
const G = globalThis as typeof globalThis & { __coopTunnel?: Runtime };
const R: Runtime = (G.__coopTunnel ??= { child: null, state: 'stopped', url: null, error: null, startedAt: null, localUrl: null, log: [], versionCache: null, exitHooked: false });

export function cloudflaredVersion(): string | null {
  if (R.versionCache && R.versionCache.at > Date.now() - 30_000) return R.versionCache.v;
  const r = spawnSync('cloudflared', ['--version'], { encoding: 'utf8' });
  const v = r.error || r.status !== 0 ? null : (r.stdout || r.stderr).trim().split('\n')[0] || 'installed';
  R.versionCache = { at: Date.now(), v };
  return v;
}

export function status(): TunnelStatus {
  const cfg = loadConfig();
  const token = tokenOf(cfg);
  return {
    state: R.state, url: R.url, error: R.error, cloudflared: cloudflaredVersion(), log: R.log.slice(-12), startedAt: R.startedAt, localUrl: R.localUrl,
    config: { mode: cfg.mode, hostname: cfg.hostname, autoStart: cfg.autoStart, tokenSet: !!token, tokenHint: token ? `…${token.slice(-4)}` : '', tokenFromEnv: !cfg.token && !!process.env.CLOUDFLARE_TUNNEL_TOKEN },
  };
}

/** Start a tunnel to the local server at `target` (e.g. http://127.0.0.1:4173). */
export function start(target: string): TunnelStatus {
  if (R.child && (R.state === 'starting' || R.state === 'running')) return status();
  const cfg = loadConfig();
  if (!cloudflaredVersion()) {
    R.state = 'error';
    R.error = 'cloudflared is not installed or not on PATH. Install it (macOS: brew install cloudflared; Windows: winget install --id Cloudflare.cloudflared; Linux: see Cloudflare\'s downloads page), then start again.';
    return status();
  }
  const token = tokenOf(cfg);
  if (cfg.mode === 'named' && !token) {
    R.state = 'error';
    R.error = 'A named tunnel needs its token. Paste it from the Cloudflare dashboard (Zero Trust > Networks > Tunnels) and save.';
    return status();
  }
  R.state = 'starting';
  R.url = null;
  R.error = null;
  R.log = [];
  R.localUrl = target;
  R.startedAt = Date.now();
  // The token reaches cloudflared through its environment, so it stays out of process lists.
  const args = cfg.mode === 'named' ? ['tunnel', '--no-autoupdate', 'run'] : ['tunnel', '--no-autoupdate', '--url', target];
  const env = { ...process.env, ...(cfg.mode === 'named' ? { TUNNEL_TOKEN: token } : {}) };
  const c = spawn('cloudflared', args, { stdio: ['ignore', 'pipe', 'pipe'], env, detached: process.platform !== 'win32' });
  R.child = c;
  const onData = (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').map((l) => l.trim()).filter(Boolean)) {
      R.log = [...R.log, token ? line.split(token).join('[token]') : line].slice(-50);
      const quick = line.match(QUICK_URL)?.[0];
      if (quick && cfg.mode === 'quick') { R.url = quick; R.state = 'running'; }
      if (cfg.mode === 'named' && /Registered tunnel connection/.test(line)) { R.url = cfg.hostname ? `https://${cfg.hostname}` : null; R.state = 'running'; }
      if (/Unauthorized|invalid tunnel token|failed to unmarshal|provided tunnel token/i.test(line)) { R.state = 'error'; R.error = 'Cloudflare rejected the tunnel token. Check it in Settings.'; }
    }
  };
  c.stdout?.on('data', onData);
  c.stderr?.on('data', onData);
  c.on('exit', (code) => {
    if (R.child !== c) return;
    R.child = null;
    if (R.state !== 'stopped') {
      R.state = 'error';
      R.error = R.error ?? `cloudflared stopped unexpectedly (exit code ${code}). See the log below.`;
    }
    R.url = null;
  });
  c.on('error', (e) => { R.state = 'error'; R.error = `Could not start cloudflared: ${e.message}`; });
  return status();
}

export function stop(): TunnelStatus {
  const c = R.child;
  R.child = null;
  R.state = 'stopped';
  R.url = null;
  R.error = null;
  R.startedAt = null;
  if (c && c.exitCode === null && c.pid !== undefined) {
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F']);
      else process.kill(-c.pid, 'SIGTERM');
    } catch {
      c.kill('SIGTERM');
    }
  }
  return status();
}

/** Stop the tunnel when this process ends, so it never outlives the game server. */
export function stopOnExit(): void {
  if (R.exitHooked) return;
  R.exitHooked = true;
  process.on('exit', () => { stop(); });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { stop(); process.exit(0); });
}
