// Local control API for the Cloudflare Tunnel (D-123), mounted on the game's own dev/preview
// server so the Settings screen can configure, start and stop sharing. It answers only the
// player on this machine: requests must be addressed to localhost and carry no Cloudflare
// headers, so nobody arriving through the tunnel can see or change it, or read the token.

import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { loadConfig, saveConfig, start, status, stop, stopOnExit, type TunnelConfig } from './manager';

export const API_BASE = '/__coop/tunnel';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const hostName = (h: string | undefined) => {
  if (!h) return '';
  const s = h.trim().toLowerCase();
  return s.startsWith('[') ? s.slice(0, s.indexOf(']') + 1) : s.split(':')[0];
};

/** Is this request from the player at this machine, not a visitor through the tunnel? */
export function isLocalRequest(req: Pick<IncomingMessage, 'headers'>): boolean {
  const h = req.headers;
  if (!LOCAL_HOSTS.has(hostName(h.host))) return false;
  // cloudflared forwards these on every tunneled request.
  if (h['cf-ray'] || h['cf-connecting-ip'] || h['cf-visitor'] || String(h['cdn-loop'] ?? '').includes('cloudflare')) return false;
  if (h.origin) {
    try { if (!LOCAL_HOSTS.has(hostName(new URL(String(h.origin)).host))) return false; } catch { return false; }
  }
  return true;
}

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('Request too large');
  }
  return raw ? JSON.parse(raw) : {};
}

/** Connect-style handler; calls next() for anything that is not the tunnel API. */
export async function handleTunnelApi(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith(API_BASE)) return next();
  // Outsiders get a plain 404, as if there were nothing here.
  if (!isLocalRequest(req)) return send(res, 404, { error: 'Not found' });
  const action = path.slice(API_BASE.length);
  try {
    if (req.method === 'GET' && action === '/status') return send(res, 200, status());
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    // A custom header and JSON body: a cross-site form or image request cannot produce either.
    if (req.headers['x-coop-admin'] !== '1' || !String(req.headers['content-type'] ?? '').includes('application/json')) return send(res, 403, { error: 'Forbidden' });
    const body = await readJson(req);
    if (action === '/config') {
      const patch: Partial<TunnelConfig> = {};
      if (body.mode === 'quick' || body.mode === 'named') patch.mode = body.mode;
      if (typeof body.hostname === 'string') patch.hostname = body.hostname;
      if (typeof body.autoStart === 'boolean') patch.autoStart = body.autoStart;
      // The token is write-only: send a new one to replace it, or clearToken to remove it.
      if (typeof body.token === 'string' && body.token.trim()) patch.token = body.token;
      if (body.clearToken === true) patch.token = '';
      saveConfig(patch);
      return send(res, 200, status());
    }
    if (action === '/start') return send(res, 200, start(`http://127.0.0.1:${req.socket.localPort}`));
    if (action === '/stop') return send(res, 200, stop());
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    return send(res, 400, { error: (e as Error).message });
  }
}

/** Mounts the API on Vite's dev and preview servers, and starts the tunnel if set to. */
export function tunnelControl(): Plugin {
  const hook = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => { void handleTunnelApi(req, res, next); });
    const http = server.httpServer as unknown as HttpServer | null;
    if (!http) return;
    stopOnExit();
    http.on('close', () => { stop(); });
    http.once('listening', () => {
      if (!(loadConfig().autoStart || process.env.TUNNEL_AUTOSTART === '1')) return;
      const addr = http.address();
      if (!addr || typeof addr === 'string') return;
      start(`http://127.0.0.1:${addr.port}`);
      announceWhenUp();
    });
  };
  return { name: 'coop-tunnel-control', configureServer: hook, configurePreviewServer: hook };
}

/** Print the public address once the tunnel is up (for terminal users). */
export function announceWhenUp(onUp?: (url: string | null) => void): void {
  const t = setInterval(() => {
    const s = status();
    if (s.state === 'running' || s.state === 'error' || s.state === 'stopped') {
      clearInterval(t);
      if (s.state === 'running') {
        console.log(['', '='.repeat(66), ' Agricultural Cooperative Tycoon is shared at:', `   ${s.url ?? 'the public hostname routed to your named tunnel'}`, ' Stop sharing from Settings in the game, or press Ctrl+C.', '='.repeat(66), ''].join('\n'));
      } else if (s.state === 'error') console.error(`Tunnel: ${s.error}`);
      onUp?.(s.url);
    }
  }, 500);
  t.unref?.();
}
