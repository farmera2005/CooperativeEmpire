import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE, handleTunnelApi, isLocalRequest } from '../tools/tunnel/api';
import { adminKey } from '../tools/tunnel/manager';

/** A minimal request/response pair for the middleware. */
function call(method: string, path: string, headers: Record<string, string>, body?: unknown, remoteAddress = '127.0.0.1') {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as import('node:http').IncomingMessage;
  Object.assign(req, { method, url: path, headers, socket: { localPort: 4173, remoteAddress } });
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
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coop-tunnel-'));
    process.env.TUNNEL_CONFIG_FILE = join(dir, 'tunnel.json');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TUNNEL_CONFIG_FILE;
  });

  it('trusts a loopback connection addressed to localhost, never a header alone', () => {
    const at = (host: string, remoteAddress = '127.0.0.1', extra: Record<string, string> = {}) => isLocalRequest({ headers: { host, ...extra }, socket: { remoteAddress } });
    expect(at('localhost:5173')).toBe(true);
    expect(at('127.0.0.1:4173', '::ffff:127.0.0.1')).toBe(true);
    expect(at('[::1]:4173', '::1')).toBe(true);
    // Another computer on the network can claim Host: localhost; its address gives it away.
    expect(at('localhost:8080', '192.168.1.20')).toBe(false);
    expect(at('localhost:8080', '172.17.0.1')).toBe(false);
    expect(at('quiet-fields.trycloudflare.com')).toBe(false);
    expect(at('localhost:4173', '127.0.0.1', { 'cf-ray': 'abc' })).toBe(false);
    expect(at('localhost:4173', '127.0.0.1', { origin: 'https://evil.example.com' })).toBe(false);
  });

  it('lets another computer in only with the sharing key, and never through the tunnel', async () => {
    const lan = { host: '192.168.1.10:8080' };
    const r401 = await call('GET', `${API_BASE}/status`, lan, undefined, '192.168.1.20');
    expect(r401.status).toBe(401);
    expect((r401.body as { needKey: boolean }).needKey).toBe(true);
    expect((await call('GET', `${API_BASE}/status`, { ...lan, 'x-coop-admin-key': 'wrong' }, undefined, '192.168.1.20')).status).toBe(401);
    const key = adminKey();
    expect(key.length).toBeGreaterThanOrEqual(20);
    expect(adminKey()).toBe(key);
    const ok = await call('GET', `${API_BASE}/status`, { ...lan, 'x-coop-admin-key': key }, undefined, '192.168.1.20');
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain(key);
    expect((await call('POST', `${API_BASE}/stop`, { ...lan, 'x-coop-admin-key': key, 'x-coop-admin': '1', 'content-type': 'application/json' }, {}, '192.168.1.20')).status).toBe(200);
    expect((await call('GET', `${API_BASE}/status`, { host: 'x.trycloudflare.com', 'cf-ray': '1', 'x-coop-admin-key': key }, undefined, '127.0.0.1')).status).toBe(404);
  });

  it('hides the API from tunneled requests and passes other paths through', async () => {
    expect((await call('GET', `${API_BASE}/status`, { host: 'x.trycloudflare.com', 'cf-connecting-ip': '203.0.113.9' })).status).toBe(404);
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
