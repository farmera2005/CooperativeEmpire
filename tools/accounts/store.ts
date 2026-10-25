// User accounts and their saved games, kept by the game's own server (D-127). Everything lives in
// one data folder: users.json (scrypt password hashes, never passwords) and saves/<user id>/,
// written atomically and readable only by the server's user. Sessions and sign-in throttling are
// held in memory, so a restart signs everyone out.

import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export type Role = 'admin' | 'player';

export interface UserRecord {
  id: string;
  username: string;
  role: Role;
  passwordHash: string;
  /** Set for the built-in admin's temporary password and after an admin reset. */
  mustChangePassword: boolean;
  disabled: boolean;
  /** The built-in admin: cannot be deleted, disabled or demoted. */
  builtIn?: boolean;
  /** Registered while sign-ups need approval (D-128); cannot sign in until an admin approves. */
  pending?: boolean;
  /** Made by the player on the sign-in page rather than by an admin. */
  selfRegistered?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

/** What a browser may see of an account. */
export interface UserView {
  id: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  disabled: boolean;
  builtIn: boolean;
  pending: boolean;
  selfRegistered: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Who may create their own account on the sign-in page (D-128). */
export type RegistrationMode = 'open' | 'approval' | 'off';
export interface AccountSettings { registration: RegistrationMode }
const DEFAULT_SETTINGS: AccountSettings = { registration: 'open' };

export interface SaveMeta {
  id: string;
  name: string;
  coopName: string;
  monthIndex: number;
  dateLabel: string;
  savedAt: string;
  auto: boolean;
}

export const BUILTIN_ADMIN = 'admin';
// The built-in admin's temporary password, stored only as this hash; it was given to the owner
// when accounts were added. COOP_ADMIN_PASSWORD replaces it for a fresh data folder, and
// `npm run admin:reset` issues a new one. Either way it must be changed at first sign-in.
const BUILTIN_TEMP_HASH = 'scrypt$16384$8$1$JHVY7hizoBc1XceF5g4eaw$kXIywWL2vfKPvaKQuYaQPijOvX1ekL_trseTGxb9OCF2eDgXKBUqvZA1MMGPz5gKM0Ow81YnFjrIPbqJofULKg';

export const PASSWORD_MIN = 10;
const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,31}$/;
const SESSION_DAYS = 14;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const AUTOSAVES_KEPT = 3;
export const SAVES_PER_USER = 60;
/** Ceiling on accounts, so open sign-ups cannot fill the disk. */
export const MAX_ACCOUNTS = 500;
const REGISTRATIONS_PER_HOUR = 5;

/** Where accounts live: COOP_DATA_DIR, or .coop-data in the project (git-ignored). */
export const dataDir = (): string => process.env.COOP_DATA_DIR ?? resolve(process.cwd(), '.coop-data');
const usersFile = () => join(dataDir(), 'users.json');
const savesDir = (userId: string) => join(dataDir(), 'saves', userId);

function writePrivate(file: string, data: string | Buffer): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch { /* not supported on this platform */ }
  renameSync(tmp, file);
}

// ---- passwords ----

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scrypt = (password: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((ok, fail) => scryptCb(password.normalize('NFKC'), salt, len, opts, (e, key) => (e ? fail(e) : ok(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await scrypt(password, Buffer.from(salt, 'base64url'), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return got.length === want.length && timingSafeEqual(got, want);
}

// A hash to check against when the username is unknown, so the reply takes as long either way.
let dummyHash: Promise<string> | null = null;

/** Why a new password is not acceptable, or null. */
export function passwordProblem(password: unknown, username: string): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > 200) return 'That password is too long.';
  if (password.toLowerCase().includes(username.toLowerCase())) return 'The password must not contain the username.';
  return null;
}

/** A readable temporary password for resets. */
export function temporaryPassword(): string {
  return `${randomBytes(9).toString('base64url').replace(/[-_]/g, 'x')}-${randomBytes(2).readUInt16BE() % 9000 + 1000}`;
}

// ---- users ----

export const viewOf = (u: UserRecord): UserView => ({
  id: u.id, username: u.username, role: u.role, mustChangePassword: u.mustChangePassword, disabled: u.disabled,
  builtIn: !!u.builtIn, pending: !!u.pending, selfRegistered: !!u.selfRegistered, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt ?? null,
});

interface UsersFile { version?: number; users?: UserRecord[]; settings?: Partial<AccountSettings> }
const readFile = (): UsersFile | null => (existsSync(usersFile()) ? JSON.parse(readFileSync(usersFile(), 'utf8')) as UsersFile : null);

function readUsers(): UserRecord[] | null {
  const f = readFile();
  return f ? (Array.isArray(f.users) ? f.users : []) : null;
}

function writeFile(users: UserRecord[], settings: AccountSettings): void {
  const sorted = [...users].sort((a, b) => a.username.localeCompare(b.username));
  writePrivate(usersFile(), JSON.stringify({ version: 1, settings, users: sorted }, null, 2) + '\n');
}

const writeUsers = (users: UserRecord[]): void => writeFile(users, getSettings());

export function getSettings(): AccountSettings {
  const saved = readFile()?.settings ?? {};
  const registration = saved.registration === 'approval' || saved.registration === 'off' || saved.registration === 'open' ? saved.registration : DEFAULT_SETTINGS.registration;
  return { registration };
}

export async function saveSettings(patch: { registration?: unknown }): Promise<AccountSettings> {
  const next = getSettings();
  if (patch.registration !== undefined) {
    if (patch.registration !== 'open' && patch.registration !== 'approval' && patch.registration !== 'off') throw new AccountError('Unknown sign-up setting.');
    next.registration = patch.registration;
  }
  writeFile(await loadUsers(), next);
  return next;
}

/** All accounts, creating the built-in admin with its temporary password on first use. */
export async function loadUsers(): Promise<UserRecord[]> {
  const users = readUsers();
  if (users && users.some((u) => u.builtIn)) return users;
  const fromEnv = process.env.COOP_ADMIN_PASSWORD;
  const admin: UserRecord = {
    id: randomUUID(), username: BUILTIN_ADMIN, role: 'admin', builtIn: true, disabled: false, mustChangePassword: true,
    passwordHash: fromEnv ? await hashPassword(fromEnv) : BUILTIN_TEMP_HASH, createdAt: new Date().toISOString(),
  };
  const next = [...(users ?? []).filter((u) => u.username !== BUILTIN_ADMIN), admin];
  writeUsers(next);
  return next;
}

export async function findUser(id: string): Promise<UserRecord | undefined> {
  return (await loadUsers()).find((u) => u.id === id);
}

async function updateUsers(fn: (users: UserRecord[]) => UserRecord[]): Promise<UserRecord[]> {
  const next = fn(await loadUsers());
  writeUsers(next);
  return next;
}

/** True while the built-in admin still has a temporary password (sharing stays off until then). */
export async function adminPasswordIsTemporary(): Promise<boolean> {
  return (await loadUsers()).some((u) => u.builtIn && u.mustChangePassword);
}

export class AccountError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function createUser(input: { username: unknown; password: unknown; role: unknown }): Promise<UserRecord> {
  const username = String(input.username ?? '').trim().toLowerCase();
  if (!USERNAME.test(username)) throw new AccountError('Usernames are 3 to 32 letters, digits, dots, dashes or underscores.');
  const users = await loadUsers();
  if (users.some((u) => u.username === username)) throw new AccountError('That username is taken.', 409);
  const problem = passwordProblem(input.password, username);
  if (problem) throw new AccountError(problem);
  const user: UserRecord = {
    id: randomUUID(), username, role: input.role === 'admin' ? 'admin' : 'player', disabled: false,
    // The admin chose this password, so the player picks their own at first sign-in.
    mustChangePassword: true, passwordHash: await hashPassword(String(input.password)), createdAt: new Date().toISOString(),
  };
  writeUsers([...users, user]);
  return user;
}

/**
 * A player creating their own account on the sign-in page (D-128). They chose the password, so
 * no change is forced. While sign-ups need approval the account waits for an admin; otherwise
 * the caller signs them straight in. `client` is the address used to limit sign-ups per hour.
 */
export async function registerUser(input: { username: unknown; password: unknown }, client: string): Promise<UserRecord> {
  const mode = getSettings().registration;
  if (mode === 'off') throw new AccountError('New accounts are made by an admin here. Ask one for an account.', 403);
  const now = Date.now();
  const recent = (S.registrations.get(client) ?? []).filter((t) => t > now - 3_600_000);
  if (recent.length >= REGISTRATIONS_PER_HOUR) throw new AccountError('Too many new accounts from here. Try again later.', 429);
  const username = String(input.username ?? '').trim().toLowerCase();
  if (!USERNAME.test(username)) throw new AccountError('Usernames are 3 to 32 letters, digits, dots, dashes or underscores.');
  const users = await loadUsers();
  if (users.some((u) => u.username === username)) throw new AccountError('That username is taken.', 409);
  if (users.length >= MAX_ACCOUNTS) throw new AccountError('This game has all the accounts it can hold. Ask an admin.', 409);
  const problem = passwordProblem(input.password, username);
  if (problem) throw new AccountError(problem);
  const user: UserRecord = {
    id: randomUUID(), username, role: 'player', disabled: false, mustChangePassword: false, selfRegistered: true,
    ...(mode === 'approval' ? { pending: true } : {}),
    passwordHash: await hashPassword(String(input.password)), createdAt: new Date().toISOString(),
  };
  writeUsers([...users, user]);
  S.registrations.set(client, [...recent, now]);
  return user;
}

export async function updateUser(id: string, patch: { role?: unknown; disabled?: unknown; password?: unknown; approve?: unknown }): Promise<UserRecord> {
  const users = await loadUsers();
  const u = users.find((x) => x.id === id);
  if (!u) throw new AccountError('No such account.', 404);
  const next = { ...u };
  if (patch.role !== undefined) {
    if (u.builtIn && patch.role !== 'admin') throw new AccountError('The built-in admin stays an admin.');
    next.role = patch.role === 'admin' ? 'admin' : 'player';
  }
  if (patch.disabled !== undefined) {
    if (u.builtIn && patch.disabled) throw new AccountError('The built-in admin cannot be disabled.');
    next.disabled = !!patch.disabled;
  }
  if (patch.approve === true) delete next.pending;
  if (patch.password !== undefined) {
    const problem = passwordProblem(patch.password, u.username);
    if (problem) throw new AccountError(problem);
    next.passwordHash = await hashPassword(String(patch.password));
    next.mustChangePassword = true;
  }
  if (!users.some((x) => x.id !== id && x.role === 'admin' && !x.disabled) && (next.role !== 'admin' || next.disabled)) {
    throw new AccountError('Keep at least one active admin.');
  }
  await updateUsers((all) => all.map((x) => (x.id === id ? next : x)));
  if (next.disabled || patch.password !== undefined || next.role !== u.role) endSessionsOf(id);
  return next;
}

export async function deleteUser(id: string): Promise<void> {
  const users = await loadUsers();
  const u = users.find((x) => x.id === id);
  if (!u) throw new AccountError('No such account.', 404);
  if (u.builtIn) throw new AccountError('The built-in admin cannot be deleted.');
  if (u.role === 'admin' && !users.some((x) => x.id !== id && x.role === 'admin' && !x.disabled)) throw new AccountError('Keep at least one active admin.');
  await updateUsers((all) => all.filter((x) => x.id !== id));
  endSessionsOf(id);
  rmSync(savesDir(id), { recursive: true, force: true });
}

export async function changePassword(id: string, current: unknown, next: unknown): Promise<UserRecord> {
  const u = await findUser(id);
  if (!u) throw new AccountError('No such account.', 404);
  if (typeof current !== 'string' || !(await verifyPassword(current, u.passwordHash))) throw new AccountError('The current password is not right.', 403);
  const problem = passwordProblem(next, u.username);
  if (problem) throw new AccountError(problem);
  if (next === current) throw new AccountError('Choose a password different from the current one.');
  const updated = { ...u, passwordHash: await hashPassword(String(next)), mustChangePassword: false };
  await updateUsers((all) => all.map((x) => (x.id === id ? updated : x)));
  return updated;
}

/** Recovery from the command line: give the built-in admin a new temporary password. */
export async function resetBuiltInAdmin(password: string): Promise<void> {
  const hash = await hashPassword(password);
  await updateUsers((all) => all.map((x) => (x.builtIn ? { ...x, passwordHash: hash, mustChangePassword: true, disabled: false, role: 'admin' } : x)));
  const admin = (await loadUsers()).find((u) => u.builtIn);
  if (admin) endSessionsOf(admin.id);
  S.failures.delete(BUILTIN_ADMIN);
}

// ---- sessions and sign-in throttling (memory only) ----

interface Session { userId: string; expires: number }
interface Runtime { sessions: Map<string, Session>; failures: Map<string, { count: number; lockedUntil: number }>; registrations: Map<string, number[]> }
// Vite bundles its config (and this module) separately from anything else that imports it, so
// the state lives on globalThis for every copy to share.
const G = globalThis as typeof globalThis & { __coopAccounts?: Runtime };
const S: Runtime = (G.__coopAccounts ??= { sessions: new Map(), failures: new Map(), registrations: new Map() });
S.registrations ??= new Map();

/** Check a sign-in; returns the account, or throws with a message safe to show. */
export async function signIn(usernameIn: unknown, password: unknown): Promise<{ user: UserRecord; token: string }> {
  const username = String(usernameIn ?? '').trim().toLowerCase();
  const f = S.failures.get(username);
  const now = Date.now();
  if (f && f.lockedUntil > now) throw new AccountError(`Too many wrong passwords. Try again in ${Math.ceil((f.lockedUntil - now) / 60_000)} minutes.`, 429);
  const users = await loadUsers();
  const u = users.find((x) => x.username === username);
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'));
  const ok = await verifyPassword(typeof password === 'string' ? password : '', u?.passwordHash ?? (await dummyHash));
  if (!u || !ok) {
    const count = (f && f.lockedUntil <= now && f.lockedUntil > 0 ? 0 : f?.count ?? 0) + 1;
    S.failures.set(username, { count, lockedUntil: count >= LOCK_AFTER ? now + LOCK_MINUTES * 60_000 : 0 });
    throw new AccountError('Wrong username or password.', 401);
  }
  if (u.pending) throw new AccountError('Your account is waiting for an admin to approve it.', 403);
  if (u.disabled) throw new AccountError('This account is disabled. Ask an admin.', 403);
  S.failures.delete(username);
  return { user: u, token: await startSession(u) };
}

/** Open a session for an account that has just proven who it is. */
export async function startSession(u: UserRecord): Promise<string> {
  await updateUsers((all) => all.map((x) => (x.id === u.id ? { ...x, lastLoginAt: new Date().toISOString() } : x)));
  const token = randomBytes(32).toString('base64url');
  S.sessions.set(token, { userId: u.id, expires: Date.now() + SESSION_DAYS * 86_400_000 });
  return token;
}

/** The signed-in account for a session token, extending the session while it is used. */
export async function sessionUser(token: string | undefined): Promise<UserRecord | null> {
  if (!token) return null;
  const s = S.sessions.get(token);
  if (!s || s.expires < Date.now()) { if (s) S.sessions.delete(token); return null; }
  const u = await findUser(s.userId);
  if (!u || u.disabled || u.pending) { S.sessions.delete(token); return null; }
  s.expires = Date.now() + SESSION_DAYS * 86_400_000;
  return u;
}

export const signOut = (token: string | undefined): void => { if (token) S.sessions.delete(token); };
export const SESSION_MAX_AGE_S = SESSION_DAYS * 86_400;

function endSessionsOf(userId: string): void {
  for (const [t, s] of [...S.sessions.entries()]) if (s.userId === userId) S.sessions.delete(t);
}

// ---- saves (one folder per account) ----

const SAFE_ID = /^[a-z0-9-]{1,80}$/;
const metaFile = (userId: string, id: string) => join(savesDir(userId), `${id}.meta.json`);
const dataFile = (userId: string, id: string) => join(savesDir(userId), `${id}.json.gz`);

export function listSaves(userId: string): SaveMeta[] {
  if (!existsSync(savesDir(userId))) return [];
  const metas: SaveMeta[] = [];
  for (const f of readdirSync(savesDir(userId)).filter((n) => n.endsWith('.meta.json')).sort()) {
    try { metas.push(JSON.parse(readFileSync(join(savesDir(userId), f), 'utf8'))); } catch { /* skip a damaged entry */ }
  }
  return metas.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
}

const text = (v: unknown, max: number) => String(v ?? '').slice(0, max);

export function writeSave(userId: string, input: { name: unknown; coopName: unknown; monthIndex: unknown; dateLabel: unknown; auto: unknown; data: unknown }): SaveMeta {
  if (typeof input.data !== 'string' || !input.data.startsWith('{')) throw new AccountError('Not a saved game.');
  const auto = input.auto === true;
  const name = text(input.name, 80) || 'Save';
  const monthIndex = Number.isFinite(Number(input.monthIndex)) ? Math.trunc(Number(input.monthIndex)) : 0;
  const savedAt = new Date().toISOString();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'save';
  const id = auto ? `auto-${monthIndex}-${Date.now()}` : `slot-${slug}`;
  const existing = listSaves(userId);
  if (!existing.some((m) => m.id === id) && existing.filter((m) => !m.auto).length >= SAVES_PER_USER && !auto) {
    throw new AccountError(`You have ${SAVES_PER_USER} saved games; delete some first.`, 409);
  }
  const meta: SaveMeta = { id, name, coopName: text(input.coopName, 80), monthIndex, dateLabel: text(input.dateLabel, 20), savedAt, auto };
  writePrivate(dataFile(userId, id), gzipSync(input.data));
  writePrivate(metaFile(userId, id), JSON.stringify(meta));
  if (auto) for (const old of listSaves(userId).filter((m) => m.auto).slice(AUTOSAVES_KEPT)) deleteSave(userId, old.id);
  return meta;
}

export function readSave(userId: string, id: string): string {
  if (!SAFE_ID.test(id) || !existsSync(dataFile(userId, id))) throw new AccountError('Save not found.', 404);
  return gunzipSync(readFileSync(dataFile(userId, id))).toString('utf8');
}

export function deleteSave(userId: string, id: string): void {
  if (!SAFE_ID.test(id)) throw new AccountError('Save not found.', 404);
  rmSync(dataFile(userId, id), { force: true });
  rmSync(metaFile(userId, id), { force: true });
}
