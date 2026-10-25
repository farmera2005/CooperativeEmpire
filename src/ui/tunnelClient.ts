// Talks to the game server's tunnel control API (tools/tunnel/api.ts, D-123, D-126). The API
// exists only on the dev/preview server (and the Docker app service); static hosting and
// visitors through the tunnel get 404. From another computer it needs the sharing key, which
// this browser remembers once entered.

export interface TunnelStatusView {
  state: 'stopped' | 'starting' | 'running' | 'error';
  url: string | null;
  error: string | null;
  cloudflared: string | null;
  config: { mode: 'quick' | 'named'; hostname: string; autoStart: boolean; tokenSet: boolean; tokenHint: string; tokenFromEnv: boolean };
  log: string[];
  startedAt: number | null;
  localUrl: string | null;
}

export type TunnelAvailability = 'ok' | 'needKey' | 'remote' | 'unsupported';

const BASE = '/__coop/tunnel';
const KEY_STORE = 'coop.sharingKey';
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Opened by a name other than localhost (another computer, or through the tunnel). */
export const openedRemotely = (): boolean => !LOCAL.has(window.location.hostname);

/** The sharing key this browser remembers (a per-viewer convenience; storage may be unavailable). */
export function savedKey(): string {
  try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; }
}
export function rememberKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORE, key);
    else localStorage.removeItem(KEY_STORE);
  } catch { /* not stored: asked again next time */ }
}
const keyHeader = (): Record<string, string> => (savedKey() ? { 'X-Coop-Admin-Key': savedKey() } : {});

export async function fetchStatus(): Promise<{ availability: TunnelAvailability; status: TunnelStatusView | null }> {
  try {
    const r = await fetch(`${BASE}/status`, { cache: 'no-store', headers: keyHeader() });
    const json = (r.headers.get('content-type') ?? '').includes('application/json');
    if (r.status === 401 && json) return { availability: 'needKey', status: null };
    if (!r.ok || !json) return { availability: openedRemotely() ? 'remote' : 'unsupported', status: null };
    return { availability: 'ok', status: await r.json() };
  } catch {
    return { availability: openedRemotely() ? 'remote' : 'unsupported', status: null };
  }
}

async function postJson(action: string, body: unknown = {}): Promise<TunnelStatusView> {
  const r = await fetch(`${BASE}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Coop-Admin': '1', ...keyHeader() }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? `Request failed (${r.status})`);
  return data;
}

export const saveTunnelConfig = (cfg: { mode?: 'quick' | 'named'; token?: string; clearToken?: boolean; hostname?: string; autoStart?: boolean }) => postJson('config', cfg);
export const startTunnel = () => postJson('start');
export const stopTunnel = () => postJson('stop');
