import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE, handleTunnelApi, isLocalRequest } from '../tools/tunnel/api';

/** A minimal request/response pair for the middleware. */
function call(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as import('node:http').IncomingMessage;
  Object.assign(req, { method, url: path, headers, socket: { localPort: 4173 } });
  const out: { status: number; body: unknown; nextCalled: boolean } = { status: 0, body: null, nextCalled: false };
  const fake: { statusCode: number; setHeader: () => void; end: (s: string) => void } = {
    statusCode: 0, setHeader: () => {}, end: (s: string) => { out.status = fake.statusCode; out.body = JSON.parse(s); },
  };
  const res = fake as unknown as import('node:http').ServerResponse;
  return handleTunnelApi(req, res, () => { out.nextCalled = true; }).then(() => out);
}
const local = { host: 'localhost:4173' };
const admin = { ...local, 'x-coop-admin': '1', 'content-type': 'application/json' };

describe('tunnel control API (D-123)', () => {
  beforeEach(() => { process.env.TUNNEL_CONFIG_FILE = join(mkdtempSync(join(tmpdir(), 'coop-tunnel-')), 'tunnel.json'); });

  it('answers only the player on this machine, never a visitor through the tunnel', () => {
    expect(isLocalRequest({ headers: { host: 'localhost:5173' } })).toBe(true);
    expect(isLocalRequest({ headers: { host: '127.0.0.1:4173' } })).toBe(true);
    expect(isLocalRequest({ headers: { host: '[::1]:4173' } })).toBe(true);
    expect(isLocalRequest({ headers: { host: 'quiet-fields.trycloudflare.com' } })).toBe(false);
    expect(isLocalRequest({ headers: { host: 'localhost:4173', 'cf-ray': 'abc' } })).toBe(false);
    expect(isLocalRequest({ headers: { host: 'localhost:4173', 'cf-connecting-ip': '1.2.3.4' } })).toBe(false);
    expect(isLocalRequest({ headers: { host: 'localhost:4173', origin: 'https://evil.example.com' } })).toBe(false);
  });

  it('hides the API from tunneled requests and passes other paths through', async () => {
    expect((await call('GET', `${API_BASE}/status`, { host: 'x.trycloudflare.com' })).status).toBe(404);
    expect((await call('GET', '/index.html', local)).nextCalled).toBe(true);
    const s = await call('GET', `${API_BASE}/status`, local);
    expect(s.status).toBe(200);
    expect((s.body as { state: string }).state).toBe('stopped');
  });

  it('refuses changes without the admin header and a JSON body', async () => {
    expect((await call('POST', `${API_BASE}/config`, local, { mode: 'named' })).status).toBe(403);
    expect((await call('POST', `${API_BASE}/stop`, { ...local, 'content-type': 'application/json' })).status).toBe(403);
  });

  it('saves settings privately and never returns the token', async () => {
    const r = await call('POST', `${API_BASE}/config`, admin, { mode: 'named', token: 'secret-token-wxyz', hostname: 'https://coop.example.com/', autoStart: true });
    expect(r.status).toBe(200);
    const body = JSON.stringify(r.body);
    expect(body).not.toContain('secret-token');
    expect((r.body as { config: { tokenHint: string; hostname: string; tokenSet: boolean } }).config).toMatchObject({ tokenSet: true, tokenHint: '…wxyz', hostname: 'coop.example.com' });
    const file = process.env.TUNNEL_CONFIG_FILE!;
    expect(JSON.parse(readFileSync(file, 'utf8')).token).toBe('secret-token-wxyz');
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0);
    // Saving again without a token keeps it; clearToken removes it.
    await call('POST', `${API_BASE}/config`, admin, { hostname: 'coop.example.com' });
    expect(JSON.parse(readFileSync(file, 'utf8')).token).toBe('secret-token-wxyz');
    await call('POST', `${API_BASE}/config`, admin, { clearToken: true });
    expect(JSON.parse(readFileSync(file, 'utf8')).token).toBe('');
  });
});
