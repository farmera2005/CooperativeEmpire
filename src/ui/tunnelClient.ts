// Talks to the local server's tunnel control API (tools/tunnel/api.ts, D-123). The API exists
// only on the dev/preview server on this machine; static hosting and tunneled visitors get 404.

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

export type TunnelAvailability = 'ok' | 'remote' | 'unsupported';

const BASE = '/__coop/tunnel';
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Opened from another machine (e.g. through the tunnel): the controls are not for this visitor. */
export const openedRemotely = (): boolean => !LOCAL.has(window.location.hostname);

export async function fetchStatus(): Promise<{ availability: TunnelAvailability; status: TunnelStatusView | null }> {
  if (openedRemotely()) return { availability: 'remote', status: null };
  try {
    const r = await fetch(`${BASE}/status`, { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('application/json')) return { availability: 'unsupported', status: null };
    return { availability: 'ok', status: await r.json() };
  } catch {
    return { availability: 'unsupported', status: null };
  }
}

async function postJson(action: string, body: unknown = {}): Promise<TunnelStatusView> {
  const r = await fetch(`${BASE}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Coop-Admin': '1' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? `Request failed (${r.status})`);
  return data;
}

export const saveTunnelConfig = (cfg: { mode?: 'quick' | 'named'; token?: string; clearToken?: boolean; hostname?: string; autoStart?: boolean }) => postJson('config', cfg);
export const startTunnel = () => postJson('start');
export const stopTunnel = () => postJson('stop');
