// Talks to the game server's tunnel control API (tools/tunnel/api.ts, D-123, D-127). The API
// exists only on the dev/preview server (and the Docker app service), answers only a signed-in
// admin (by session cookie), and is hidden from visitors who came through the tunnel.

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

export type TunnelAvailability = 'ok' | 'denied' | 'remote' | 'unsupported';

const BASE = '/__coop/tunnel';
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Opened by a name other than localhost (another computer, or through the tunnel). */
export const openedRemotely = (): boolean => !LOCAL.has(window.location.hostname);

export async function fetchStatus(): Promise<{ availability: TunnelAvailability; status: TunnelStatusView | null }> {
  try {
    const r = await fetch(`${BASE}/status`, { cache: 'no-store', credentials: 'same-origin' });
    const json = (r.headers.get('content-type') ?? '').includes('application/json');
    if ((r.status === 401 || r.status === 403) && json) return { availability: 'denied', status: null };
    if (!r.ok || !json) return { availability: openedRemotely() ? 'remote' : 'unsupported', status: null };
    return { availability: 'ok', status: await r.json() };
  } catch {
    return { availability: openedRemotely() ? 'remote' : 'unsupported', status: null };
  }
}

async function postJson(action: string, body: unknown = {}): Promise<TunnelStatusView> {
  const r = await fetch(`${BASE}/${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Coop': '1' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? `Request failed (${r.status})`);
  return data;
}

export const saveTunnelConfig = (cfg: { mode?: 'quick' | 'named'; token?: string; clearToken?: boolean; hostname?: string; autoStart?: boolean }) => postJson('config', cfg);
export const startTunnel = () => postJson('start');
export const stopTunnel = () => postJson('stop');
