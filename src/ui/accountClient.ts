// Talks to the game server's accounts API (tools/accounts/api.ts, D-127). The server keeps the
// accounts and each account's saved games; the session is an HttpOnly cookie this code never
// sees. A copy served without that server (a static host, the nginx image) has no accounts:
// one player, saves in the browser.

export interface UserView {
  id: string;
  username: string;
  role: 'admin' | 'player';
  mustChangePassword: boolean;
  disabled: boolean;
  builtIn: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ServerSaveMeta {
  id: string;
  name: string;
  coopName: string;
  monthIndex: number;
  dateLabel: string;
  savedAt: string;
  auto: boolean;
}

const BASE = '/__coop/api';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  const r = await fetch(`${BASE}${path}`, {
    method, cache: 'no-store', credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Coop': '1' },
    body: method === 'GET' ? undefined : JSON.stringify(init.body ?? {}),
  });
  const json = (r.headers.get('content-type') ?? '').includes('application/json');
  const data = json ? await r.json() : null;
  if (!r.ok || !json) throw new ApiError(data?.error ?? `Request failed (${r.status})`, r.status);
  return data as T;
}

/** 'server' with the signed-in account (or null), or 'browser' when there is no accounts server. */
export async function fetchSession(): Promise<{ mode: 'server' | 'browser'; user: UserView | null }> {
  try {
    const r = await call<{ user: UserView | null }>('/session');
    return { mode: 'server', user: r.user };
  } catch {
    return { mode: 'browser', user: null };
  }
}

export const signIn = (username: string, password: string) => call<{ user: UserView }>('/login', { body: { username, password } }).then((r) => r.user);
export const signOut = () => call<{ user: null }>('/logout', { body: {} });
export const changePassword = (current: string, next: string) => call<{ user: UserView }>('/password', { body: { current, next } }).then((r) => r.user);

export const listUsers = () => call<{ users: UserView[] }>('/users').then((r) => r.users);
export const createUser = (username: string, password: string, role: UserView['role']) => call<{ user: UserView }>('/users', { body: { username, password, role } }).then((r) => r.user);
export const updateUser = (id: string, patch: { role?: UserView['role']; disabled?: boolean; password?: string }) => call<{ user: UserView }>(`/users/${id}`, { body: patch }).then((r) => r.user);
export const deleteUser = (id: string) => call<{ ok: true }>(`/users/${id}/delete`, { body: {} });

export const listServerSaves = () => call<{ saves: ServerSaveMeta[] }>('/saves').then((r) => r.saves);
export const readServerSave = (id: string) => call<{ data: string }>(`/saves/${encodeURIComponent(id)}`).then((r) => r.data);
export const writeServerSave = (save: Omit<ServerSaveMeta, 'id' | 'savedAt'> & { data: string }) => call<{ save: ServerSaveMeta }>('/saves', { body: save }).then((r) => r.save);
export const deleteServerSave = (id: string) => call<{ ok: true }>(`/saves/${encodeURIComponent(id)}/delete`, { body: {} });

/** A password long enough for the server (it checks again). */
export const PASSWORD_MIN = 10;
