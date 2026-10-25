import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNTS_BASE, handleAccountsApi } from '../tools/accounts/api';
import { adminPasswordIsTemporary, dataDir, resetBuiltInAdmin, verifyPassword } from '../tools/accounts/store';
import { API_BASE, handleTunnelApi } from '../tools/tunnel/api';

type Out = { status: number; body: Record<string, unknown>; headers: Record<string, string>; nextCalled: boolean };

/** A minimal request/response pair for the middleware (accounts first, then tunnel, as mounted). */
async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Out> {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as import('node:http').IncomingMessage;
  Object.assign(req, { method, url: path, headers: { host: 'localhost:4173', ...headers }, socket: { localPort: 4173, remoteAddress: '127.0.0.1' } });
  const out: Out = { status: 0, body: {}, headers: {}, nextCalled: false };
  const fake = {
    statusCode: 0,
    setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
    end: (s: string) => { out.status = fake.statusCode; out.body = JSON.parse(s); },
  };
  const res = fake as unknown as import('node:http').ServerResponse;
  await handleAccountsApi(req, res, () => handleTunnelApi(req, res, () => { out.nextCalled = true; }));
  // The tunnel handler is async inside next(); wait for it to finish writing.
  for (let i = 0; i < 200 && !out.status && !out.nextCalled; i++) await new Promise((r) => setTimeout(r, 5));
  return out;
}
const write = { 'x-coop': '1', 'content-type': 'application/json' };
const ADMIN_PW = 'first-run-temporary-1';

async function signIn(username: string, password: string): Promise<{ out: Out; cookie: string }> {
  const out = await call('POST', `${ACCOUNTS_BASE}/login`, write, { username, password });
  const cookie = (out.headers['set-cookie'] ?? '').split(';')[0];
  return { out, cookie };
}
/** Sign in as the built-in admin and replace the temporary password. */
async function adminSession(): Promise<string> {
  const { cookie } = await signIn('admin', ADMIN_PW);
  const r = await call('POST', `${ACCOUNTS_BASE}/password`, { ...write, cookie }, { current: ADMIN_PW, next: 'a-much-better-secret' });
  expect(r.status).toBe(200);
  return cookie;
}

describe('accounts and sharing controls (D-127)', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coop-accounts-'));
    process.env.COOP_DATA_DIR = join(dir, 'data');
    process.env.TUNNEL_CONFIG_FILE = join(dir, 'tunnel.json');
    process.env.COOP_ADMIN_PASSWORD = ADMIN_PW;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.COOP_DATA_DIR;
    delete process.env.TUNNEL_CONFIG_FILE;
    delete process.env.COOP_ADMIN_PASSWORD;
  });

  it('creates the built-in admin with a temporary password that must be changed first', async () => {
    expect((await call('GET', `${ACCOUNTS_BASE}/session`)).body).toEqual({ user: null, registration: 'open' });
    expect(await adminPasswordIsTemporary()).toBe(true);
    const { out, cookie } = await signIn('admin', ADMIN_PW);
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie']).toMatch(/HttpOnly; SameSite=Strict/);
    expect(out.body.user).toMatchObject({ username: 'admin', role: 'admin', builtIn: true, mustChangePassword: true });
    // Nothing else opens until the password changes: not saves, accounts or sharing.
    expect((await call('GET', `${ACCOUNTS_BASE}/saves`, { cookie })).status).toBe(403);
    expect((await call('GET', `${ACCOUNTS_BASE}/users`, { cookie })).status).toBe(403);
    expect((await call('GET', `${API_BASE}/status`, { cookie })).status).toBe(403);
    expect((await call('POST', `${ACCOUNTS_BASE}/password`, { ...write, cookie }, { current: ADMIN_PW, next: 'short' })).status).toBe(400);
    expect((await call('POST', `${ACCOUNTS_BASE}/password`, { ...write, cookie }, { current: 'wrong', next: 'a-much-better-secret' })).status).toBe(403);
    expect((await call('POST', `${ACCOUNTS_BASE}/password`, { ...write, cookie }, { current: ADMIN_PW, next: 'a-much-better-secret' })).status).toBe(200);
    expect(await adminPasswordIsTemporary()).toBe(false);
    expect((await call('GET', `${API_BASE}/status`, { cookie })).status).toBe(200);
    // Stored as a salted hash in a private file, never the password.
    const file = join(dataDir(), 'users.json');
    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toContain('a-much-better-secret');
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0);
    expect(await verifyPassword('a-much-better-secret', JSON.parse(raw).users[0].passwordHash)).toBe(true);
    // The old password no longer works; signing out ends the session.
    expect((await signIn('admin', ADMIN_PW)).out.status).toBe(401);
    await call('POST', `${ACCOUNTS_BASE}/logout`, { ...write, cookie });
    expect((await call('GET', `${ACCOUNTS_BASE}/session`, { cookie })).body.user).toBeNull();
  });

  it('lets an admin manage accounts, and keeps each account\'s saves to itself', async () => {
    const admin = await adminSession();
    const made = await call('POST', `${ACCOUNTS_BASE}/users`, { ...write, cookie: admin }, { username: 'Pat.Farmer', password: 'temporary-pass-1', role: 'player' });
    expect(made.status).toBe(200);
    expect(made.body.user).toMatchObject({ username: 'pat.farmer', role: 'player', mustChangePassword: true });
    expect((await call('POST', `${ACCOUNTS_BASE}/users`, { ...write, cookie: admin }, { username: 'pat.farmer', password: 'temporary-pass-1' })).status).toBe(409);
    const patId = (made.body.user as { id: string }).id;

    const pat = (await signIn('pat.farmer', 'temporary-pass-1')).cookie;
    await call('POST', `${ACCOUNTS_BASE}/password`, { ...write, cookie: pat }, { current: 'temporary-pass-1', next: 'pats-own-password' });
    // Players cannot manage accounts or sharing.
    expect((await call('GET', `${ACCOUNTS_BASE}/users`, { cookie: pat })).status).toBe(403);
    expect((await call('GET', `${API_BASE}/status`, { cookie: pat })).status).toBe(403);

    const save = { name: 'Spring 1972', coopName: 'Prairie Co-op', monthIndex: 26, dateLabel: 'Mar 1972', auto: false, data: '{"version":9,"state":{}}' };
    const saved = await call('POST', `${ACCOUNTS_BASE}/saves`, { ...write, cookie: pat }, save);
    expect(saved.status).toBe(200);
    const id = (saved.body.save as { id: string }).id;
    expect((await call('GET', `${ACCOUNTS_BASE}/saves`, { cookie: pat })).body.saves).toHaveLength(1);
    expect((await call('GET', `${ACCOUNTS_BASE}/saves/${id}`, { cookie: pat })).body.data).toBe(save.data);
    // The admin has their own (empty) list and cannot open Pat's save.
    expect((await call('GET', `${ACCOUNTS_BASE}/saves`, { cookie: admin })).body.saves).toHaveLength(0);
    expect((await call('GET', `${ACCOUNTS_BASE}/saves/${id}`, { cookie: admin })).status).toBe(404);
    expect((await call('GET', `${ACCOUNTS_BASE}/saves/..%2F..%2Fusers`, { cookie: pat })).status).toBe(404);

    // Autosaves keep the latest three.
    for (let m = 0; m < 5; m++) await call('POST', `${ACCOUNTS_BASE}/saves`, { ...write, cookie: pat }, { ...save, auto: true, monthIndex: m });
    const list = (await call('GET', `${ACCOUNTS_BASE}/saves`, { cookie: pat })).body.saves as { auto: boolean }[];
    expect(list.filter((s) => s.auto)).toHaveLength(3);

    // Disabling signs Pat out; a reset forces a new password; deleting removes the saves too.
    expect((await call('POST', `${ACCOUNTS_BASE}/users/${patId}`, { ...write, cookie: admin }, { disabled: true })).status).toBe(200);
    expect((await call('GET', `${ACCOUNTS_BASE}/saves`, { cookie: pat })).status).toBe(401);
    expect((await signIn('pat.farmer', 'pats-own-password')).out.status).toBe(403);
    await call('POST', `${ACCOUNTS_BASE}/users/${patId}`, { ...write, cookie: admin }, { disabled: false, password: 'reset-by-admin-1' });
    expect(((await signIn('pat.farmer', 'reset-by-admin-1')).out.body.user as { mustChangePassword: boolean }).mustChangePassword).toBe(true);
    expect(existsSync(join(dataDir(), 'saves', patId))).toBe(true);
    expect((await call('POST', `${ACCOUNTS_BASE}/users/${patId}/delete`, { ...write, cookie: admin }, {})).status).toBe(200);
    expect(existsSync(join(dataDir(), 'saves', patId))).toBe(false);
  });

  it('protects the built-in admin and the last admin', async () => {
    const admin = await adminSession();
    const users = (await call('GET', `${ACCOUNTS_BASE}/users`, { cookie: admin })).body.users as { id: string }[];
    const self = users[0].id;
    expect((await call('POST', `${ACCOUNTS_BASE}/users/${self}/delete`, { ...write, cookie: admin }, {})).status).toBe(400);
    expect((await call('POST', `${ACCOUNTS_BASE}/users/${self}`, { ...write, cookie: admin }, { role: 'player' })).status).toBe(400);
    expect((await call('POST', `${ACCOUNTS_BASE}/users/${self}`, { ...write, cookie: admin }, { disabled: true })).status).toBe(400);
  });

  it('locks an account after repeated wrong passwords, and the reset command recovers the admin', async () => {
    for (let i = 0; i < 5; i++) expect((await signIn('admin', `guess-${i}`)).out.status).toBe(401);
    expect((await signIn('admin', ADMIN_PW)).out.status).toBe(429);
    await resetBuiltInAdmin('recovered-password-1');
    const r = await signIn('admin', 'recovered-password-1');
    expect(r.out.status).toBe(200);
    expect((r.out.body.user as { mustChangePassword: boolean }).mustChangePassword).toBe(true);
    // Unknown names get the same answer as a wrong password.
    expect((await signIn('nobody', 'whatever-it-is')).out.body.error).toBe('Wrong username or password.');
  });

  it('lets players sign themselves up, as the admin allows (D-128)', async () => {
    const reg = (username: string, password: string, extra: Record<string, string> = {}) => call('POST', `${ACCOUNTS_BASE}/register`, { ...write, ...extra }, { username, password });
    expect((await call('GET', `${ACCOUNTS_BASE}/session`)).body.registration).toBe('open');
    // Open: the new player is signed in at once, with their own password and no forced change.
    const open = await reg('Corn.Grower', 'my-own-secret-1');
    expect(open.status).toBe(200);
    expect(open.body.user).toMatchObject({ username: 'corn.grower', role: 'player', mustChangePassword: false, selfRegistered: true, pending: false });
    const cookie = (open.headers['set-cookie'] ?? '').split(';')[0];
    expect((await call('GET', `${ACCOUNTS_BASE}/saves`, { cookie })).status).toBe(200);
    expect((await call('GET', `${ACCOUNTS_BASE}/users`, { cookie })).status).toBe(403);
    expect((await reg('corn.grower', 'another-secret-1')).status).toBe(409);
    expect((await reg('admin', 'another-secret-1')).status).toBe(409);
    expect((await reg('x', 'another-secret-1')).status).toBe(400);
    expect((await reg('bean.grower', 'short')).status).toBe(400);
    // A role in the request is ignored: sign-ups are always players.
    const sneaky = await call('POST', `${ACCOUNTS_BASE}/register`, write, { username: 'sneaky', password: 'another-secret-1', role: 'admin' });
    expect((sneaky.body.user as { role: string }).role).toBe('player');

    // Only an admin changes the setting.
    expect((await call('POST', `${ACCOUNTS_BASE}/settings`, { ...write, cookie }, { registration: 'off' })).status).toBe(403);
    const admin = await adminSession();
    expect((await call('POST', `${ACCOUNTS_BASE}/settings`, { ...write, cookie: admin }, { registration: 'bogus' })).status).toBe(400);

    // Approval: the account waits, cannot sign in, and the admin approves it.
    expect((await call('POST', `${ACCOUNTS_BASE}/settings`, { ...write, cookie: admin }, { registration: 'approval' })).body).toEqual({ registration: 'approval' });
    const waiting = await reg('hog.farmer', 'hogs-and-corn-1');
    expect(waiting.body).toEqual({ user: null, pending: true });
    expect(waiting.headers['set-cookie']).toBeUndefined();
    expect((await signIn('hog.farmer', 'hogs-and-corn-1')).out.body.error).toMatch(/waiting for an admin/);
    const list = (await call('GET', `${ACCOUNTS_BASE}/users`, { cookie: admin })).body.users as { id: string; username: string; pending: boolean }[];
    const hog = list.find((u) => u.username === 'hog.farmer')!;
    expect(hog.pending).toBe(true);
    await call('POST', `${ACCOUNTS_BASE}/users/${hog.id}`, { ...write, cookie: admin }, { approve: true });
    expect((await signIn('hog.farmer', 'hogs-and-corn-1')).out.status).toBe(200);

    // Off: no sign-ups at all; the setting survives in the users file.
    await call('POST', `${ACCOUNTS_BASE}/settings`, { ...write, cookie: admin }, { registration: 'off' });
    expect((await reg('late.comer', 'too-late-secret-1')).status).toBe(403);
    expect(JSON.parse(readFileSync(join(dataDir(), 'users.json'), 'utf8')).settings).toEqual({ registration: 'off' });
    expect((await call('GET', `${ACCOUNTS_BASE}/session`)).body.registration).toBe('off');
  });

  it('limits sign-ups from one address', async () => {
    const from = (n: number, ip: string) => call('POST', `${ACCOUNTS_BASE}/register`, { ...write, 'cf-ray': '1', 'cf-connecting-ip': ip }, { username: `flood${n}`, password: 'flooding-secret-1' });
    for (let n = 0; n < 5; n++) expect((await from(n, '198.51.100.7')).status).toBe(200);
    expect((await from(5, '198.51.100.7')).status).toBe(429);
    expect((await from(6, '198.51.100.8')).status).toBe(200);
  });

  it('refuses changes without the API header, and hides sharing from the tunnel', async () => {
    expect((await call('POST', `${ACCOUNTS_BASE}/login`, { 'content-type': 'application/json' }, { username: 'admin', password: ADMIN_PW })).status).toBe(403);
    const admin = await adminSession();
    expect((await call('POST', `${API_BASE}/stop`, { cookie: admin, 'content-type': 'application/json' }, {})).status).toBe(403);
    expect((await call('GET', `${API_BASE}/status`, { cookie: admin, 'cf-ray': 'abc' })).status).toBe(404);
    expect((await call('GET', `${API_BASE}/status`)).status).toBe(401);
    expect((await call('GET', '/index.html')).nextCalled).toBe(true);
    // Sign-in itself works through the tunnel, with a Secure cookie there.
    const viaTunnel = await call('POST', `${ACCOUNTS_BASE}/login`, { ...write, 'cf-ray': 'abc', 'cf-visitor': '{"scheme":"https"}' }, { username: 'admin', password: 'a-much-better-secret' });
    expect(viaTunnel.status).toBe(200);
    expect(viaTunnel.headers['set-cookie']).toMatch(/; Secure$/);
  });

  it('saves sharing settings privately and never returns the token', async () => {
    const cookie = await adminSession();
    const h = { ...write, cookie };
    const r = await call('POST', `${API_BASE}/config`, h, { mode: 'named', token: 'secret-token-wxyz', hostname: 'https://coop.example.com/', autoStart: true });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('secret-token');
    expect(r.body.config).toMatchObject({ tokenSet: true, tokenHint: '…wxyz', hostname: 'coop.example.com' });
    const file = process.env.TUNNEL_CONFIG_FILE!;
    expect(JSON.parse(readFileSync(file, 'utf8')).token).toBe('secret-token-wxyz');
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o077).toBe(0);
    await call('POST', `${API_BASE}/config`, h, { hostname: 'coop.example.com' });
    expect(JSON.parse(readFileSync(file, 'utf8')).token).toBe('secret-token-wxyz');
    await call('POST', `${API_BASE}/config`, h, { clearToken: true });
    expect(JSON.parse(readFileSync(file, 'utf8')).token).toBe('');
    expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });
});
