// Accounts and per-account saves over HTTP (D-127), mounted on the game's own dev/preview server
// next to the sharing controls. Sessions are an HttpOnly, SameSite=Strict cookie; every change
// also needs the X-Coop header and a JSON body, which a cross-site form or image cannot send.
// Through the tunnel this API works like anywhere else: visitors sign in with their own account.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { isTunneled } from '../tunnel/api.ts';
import {
  AccountError, changePassword, createUser, deleteSave, deleteUser, listSaves, loadUsers, readSave, SESSION_MAX_AGE_S,
  sessionUser, signIn, signOut, updateUser, viewOf, writeSave, type UserRecord,
} from './store.ts';

export const ACCOUNTS_BASE = '/__coop/api';
const COOKIE = 'coop_session';
const SMALL_BODY = 16_384;
const SAVE_BODY = 32 * 1024 * 1024;

export const send = (res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}): void => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
};

export async function readJson(req: IncomingMessage, limit = SMALL_BODY): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new AccountError('Request too large.', 413);
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new AccountError('Not valid JSON.'); }
}

/** A change request a cross-site page cannot forge: custom header plus JSON content type. */
export const isApiWrite = (req: IncomingMessage): boolean =>
  req.headers['x-coop'] === '1' && String(req.headers['content-type'] ?? '').includes('application/json');

const sessionToken = (req: Pick<IncomingMessage, 'headers'>): string | undefined => {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return undefined;
};

/** The account behind a request's session cookie, if any. */
export const requestUser = (req: Pick<IncomingMessage, 'headers'>): Promise<UserRecord | null> => sessionUser(sessionToken(req));

/** Admins who have set their own password (the only accounts allowed to manage things). */
export const isActiveAdmin = (u: UserRecord | null): u is UserRecord => !!u && u.role === 'admin' && !u.mustChangePassword && !u.disabled;

const viaHttps = (req: IncomingMessage) =>
  String(req.headers['x-forwarded-proto'] ?? '').includes('https') || (isTunneled(req) && String(req.headers['cf-visitor'] ?? '').includes('https'));

const cookie = (req: IncomingMessage, value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${viaHttps(req) ? '; Secure' : ''}`;

/** Connect-style handler; calls next() for anything that is not the accounts API. */
export async function handleAccountsApi(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith(ACCOUNTS_BASE)) return next();
  const route = path.slice(ACCOUNTS_BASE.length);
  const method = req.method ?? 'GET';
  try {
    if (method !== 'GET' && !isApiWrite(req)) return send(res, 403, { error: 'Forbidden' });
    const user = await requestUser(req);

    if (route === '/session' && method === 'GET') return send(res, 200, { user: user ? viewOf(user) : null });
    if (route === '/login' && method === 'POST') {
      const body = await readJson(req);
      const r = await signIn(body.username, body.password);
      return send(res, 200, { user: viewOf(r.user) }, { 'Set-Cookie': cookie(req, r.token, SESSION_MAX_AGE_S) });
    }
    if (route === '/logout' && method === 'POST') {
      signOut(sessionToken(req));
      return send(res, 200, { user: null }, { 'Set-Cookie': cookie(req, '', 0) });
    }
    if (!user) return send(res, 401, { error: 'Please sign in.', signIn: true });
    if (route === '/password' && method === 'POST') {
      const body = await readJson(req);
      return send(res, 200, { user: viewOf(await changePassword(user.id, body.current, body.next)) });
    }
    // Until the temporary password is replaced, nothing else is open to the account.
    if (user.mustChangePassword) return send(res, 403, { error: 'Change your temporary password first.', mustChangePassword: true });

    const saveId = route.match(/^\/saves\/([^/]+)(\/delete)?$/);
    if (route === '/saves' && method === 'GET') return send(res, 200, { saves: listSaves(user.id) });
    if (route === '/saves' && method === 'POST') {
      const body = await readJson(req, SAVE_BODY);
      return send(res, 200, { save: writeSave(user.id, body as Parameters<typeof writeSave>[1]) });
    }
    if (saveId && !saveId[2] && method === 'GET') return send(res, 200, { data: readSave(user.id, decodeURIComponent(saveId[1])) });
    if (saveId && saveId[2] && method === 'POST') { deleteSave(user.id, decodeURIComponent(saveId[1])); return send(res, 200, { ok: true }); }

    const userId = route.match(/^\/users\/([0-9a-f-]{36})(\/delete)?$/);
    if (route === '/users' || userId) {
      if (!isActiveAdmin(user)) return send(res, 403, { error: 'Only an admin can manage accounts.' });
      if (route === '/users' && method === 'GET') return send(res, 200, { users: (await loadUsers()).map(viewOf) });
      if (route === '/users' && method === 'POST') {
        const body = await readJson(req);
        return send(res, 200, { user: viewOf(await createUser({ username: body.username, password: body.password, role: body.role })) });
      }
      if (userId && method === 'POST' && userId[2]) {
        if (userId[1] === user.id) throw new AccountError('You cannot delete your own account.');
        await deleteUser(userId[1]);
        return send(res, 200, { ok: true });
      }
      if (userId && method === 'POST') {
        const body = await readJson(req);
        if (userId[1] === user.id && (body.disabled === true || body.role === 'player')) throw new AccountError('You cannot disable or demote your own account.');
        return send(res, 200, { user: viewOf(await updateUser(userId[1], { role: body.role, disabled: body.disabled, password: body.password })) });
      }
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e instanceof AccountError) return send(res, e.status, { error: e.message });
    console.error(`Accounts: ${(e as Error).message}`);
    return send(res, 500, { error: 'The server could not do that. See its log.' });
  }
}
