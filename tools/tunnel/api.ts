// Control API for the Cloudflare Tunnel (D-123, D-127), mounted on the game's own dev/preview
// server so the admin menu can configure, start and stop sharing. Only a signed-in admin who has
// replaced any temporary password may use it, and nobody arriving through the tunnel can reach it
// (Cloudflare marks every tunneled request), so the token is never exposed to the internet.

import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { handleAccountsApi, isActiveAdmin, isApiWrite, readJson, requestUser, send } from '../accounts/api.ts';
import { adminPasswordIsTemporary, dataDir, loadUsers } from '../accounts/store.ts';
import { loadConfig, saveConfig, start, status, stop, stopOnExit, type TunnelConfig } from './manager.ts';

export const API_BASE = '/__coop/tunnel';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** cloudflared forwards these headers on every request that came through a tunnel. */
export const isTunneled = (req: Pick<IncomingMessage, 'headers'>): boolean => {
  const h = req.headers;
  return !!(h['cf-ray'] || h['cf-connecting-ip'] || h['cf-visitor'] || String(h['cdn-loop'] ?? '').includes('cloudflare'));
};

/** Connect-style handler; calls next() for anything that is not the tunnel API. */
export async function handleTunnelApi(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith(API_BASE)) return next();
  // Visitors through the tunnel get a plain 404, as if there were nothing here.
  if (isTunneled(req)) return send(res, 404, { error: 'Not found' });
  const user = await requestUser(req);
  if (!user) return send(res, 401, { error: 'Please sign in.', signIn: true });
  if (!isActiveAdmin(user)) return send(res, 403, { error: 'Only an admin can change sharing.' });
  const action = path.slice(API_BASE.length);
  try {
    if (req.method === 'GET' && action === '/status') return send(res, 200, status());
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!isApiWrite(req)) return send(res, 403, { error: 'Forbidden' });
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
    return send(res, (e as { status?: number }).status ?? 400, { error: (e as Error).message });
  }
}

/** Mounts the accounts and tunnel APIs on Vite's dev and preview servers, and starts the tunnel if set to. */
export function tunnelControl(): Plugin {
  const hook = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => { void handleAccountsApi(req, res, next); });
    server.middlewares.use((req, res, next) => { void handleTunnelApi(req, res, next); });
    const http = server.httpServer as unknown as HttpServer | null;
    if (!http) return;
    stopOnExit();
    http.on('close', () => { stop(); });
    http.once('listening', () => { onListening().catch((e) => console.error(`Accounts and sharing: ${(e as Error).message}`)); });
    const onListening = async () => {
      const addr = http.address();
      if (!addr || typeof addr === 'string') return;
      await loadUsers();
      const temporary = await adminPasswordIsTemporary();
      if (temporary) console.log(firstSignInNote(addr.port, addr.address));
      if (!(loadConfig().autoStart || process.env.TUNNEL_AUTOSTART === '1')) return;
      // A login page with a temporary password is not put on the internet.
      if (temporary) { console.log('Sharing will not start until the admin has replaced the temporary password.'); return; }
      start(`http://127.0.0.1:${addr.port}`);
      announceWhenUp();
    };
  };
  return { name: 'coop-tunnel-control', configureServer: hook, configurePreviewServer: hook };
}

/** Printed at start while the built-in admin still has its temporary password. */
export function firstSignInNote(port: number, address = '127.0.0.1'): string {
  const where = LOOPBACK.has(address) ? `http://localhost:${port}` : `http://<this machine>:${port}`;
  return ['', '-'.repeat(66), ` Accounts are kept in ${dataDir()}.`, ` Sign in at ${where} as "admin" with the temporary password you were given`,
    ' (or run `npm run admin:reset` for a new one); you will be asked to replace it.', '-'.repeat(66), ''].join('\n');
}

/** Print the public address once the tunnel is up (for terminal users). */
export function announceWhenUp(onUp?: (url: string | null) => void): void {
  const t = setInterval(() => {
    const s = status();
    if (s.state === 'running' || s.state === 'error' || s.state === 'stopped') {
      clearInterval(t);
      if (s.state === 'running') {
        console.log(['', '='.repeat(66), ' Agricultural Cooperative Tycoon is shared at:', `   ${s.url ?? 'the public hostname routed to your named tunnel'}`, ' Stop sharing from the admin menu in the game, or press Ctrl+C.', '='.repeat(66), ''].join('\n'));
      } else if (s.state === 'error') console.error(`Tunnel: ${s.error}`);
      onUp?.(s.url);
    }
  }, 500);
  t.unref?.();
}
