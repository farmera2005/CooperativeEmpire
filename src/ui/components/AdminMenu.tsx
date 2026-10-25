import { useCallback, useEffect, useState } from 'react';
import { createUser, deleteUser, fetchAccountSettings, listUsers, PASSWORD_MIN, saveAccountSettings, updateUser, type RegistrationMode, type UserView } from '../accountClient';
import { useStore } from '../store';
import { Panel } from './Panel';
import { SharingPanel } from './SharingPanel';

/** The admin menu (D-127): accounts, and sharing over the Cloudflare Tunnel. */
export function AdminMenu() {
  const [view, setView] = useState<'users' | 'sharing'>('users');
  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-stone-300" role="tablist" aria-label="Admin menu">
        {([['users', 'Users'], ['sharing', 'Sharing']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className={`-mb-px rounded-t border px-4 py-2 text-sm ${view === id ? 'border-stone-300 border-b-[#f7f3e8] bg-[#f7f3e8] font-semibold' : 'border-transparent text-stone-600 hover:bg-[#ece6d3]'}`}>
            {label}
          </button>
        ))}
      </div>
      {view === 'users' ? <UsersPanel /> : <SharingPanel />}
    </div>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

function UsersPanel() {
  const me = useStore((s) => s.account.user);
  const [users, setUsers] = useState<UserView[]>([]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserView['role']>('player');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');

  const [registration, setRegistration] = useState<RegistrationMode | null>(null);
  const refresh = useCallback(() => listUsers().then(setUsers).catch((e) => setMsg({ tone: 'err', text: (e as Error).message })), []);
  useEffect(() => {
    void refresh();
    fetchAccountSettings().then((s) => setRegistration(s.registration)).catch(() => setRegistration(null));
  }, [refresh]);
  // Accounts waiting for approval first, so they are not missed.
  const ordered = [...users].sort((a, b) => Number(b.pending) - Number(a.pending) || a.username.localeCompare(b.username));
  const waiting = users.filter((u) => u.pending).length;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: ok });
      await refresh();
      return true;
    } catch (e) {
      setMsg({ tone: 'err', text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Accounts" right={waiting > 0 ? <span className="rounded bg-grain px-2 py-0.5 text-xs font-semibold">{waiting} waiting for approval</span> : undefined}>
        <table className="data">
          <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
          <tbody>
            {ordered.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td><b>{u.username}</b>{u.builtIn && <span className="ml-1 text-xs text-stone-500">(built-in)</span>}{u.selfRegistered && <span className="ml-1 text-xs text-stone-500">(signed up)</span>}{self && <span className="ml-1 text-xs text-stone-500">(you)</span>}</td>
                  <td>
                    <select className="input" aria-label={`Role of ${u.username}`} value={u.role} disabled={busy || u.builtIn || self}
                      onChange={(e) => act(() => updateUser(u.id, { role: e.target.value as UserView['role'] }), `${u.username} is now ${e.target.value === 'admin' ? 'an admin' : 'a player'}.`)}>
                      <option value="player">Player</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{u.pending ? <b className="text-[#8a6d1a]">Waiting for approval</b> : u.disabled ? <span className="text-rust">Disabled</span> : u.mustChangePassword ? 'Must set a password' : 'Active'}</td>
                  <td>{when(u.lastLoginAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {u.pending && <button className="btn btn-primary" disabled={busy} onClick={() => act(() => updateUser(u.id, { approve: true }), `${u.username} approved; they can sign in now.`)}>Approve</button>}
                      {!self && <button className="btn" disabled={busy} onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setResetPw(''); }}>Reset password</button>}
                      {!u.builtIn && !self && (
                        <button className="btn" disabled={busy} onClick={() => act(() => updateUser(u.id, { disabled: !u.disabled }), `${u.username} ${u.disabled ? 'enabled' : 'disabled'}.`)}>{u.disabled ? 'Enable' : 'Disable'}</button>
                      )}
                      {!u.builtIn && !self && (
                        <button className="btn" disabled={busy} onClick={() => {
                          if (window.confirm(`Delete ${u.username} and all of their saved games? This cannot be undone.`)) void act(() => deleteUser(u.id), `${u.username} deleted.`);
                        }}>{u.pending ? 'Reject' : 'Delete'}</button>
                      )}
                    </div>
                    {resetFor === u.id && (
                      <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={async (e) => {
                        e.preventDefault();
                        if (await act(() => updateUser(u.id, { password: resetPw }), `${u.username} has a new temporary password; they choose their own at next sign-in.`)) { setResetFor(null); setResetPw(''); }
                      }}>
                        <input className="input w-56" type="text" autoComplete="off" aria-label={`Temporary password for ${u.username}`} placeholder="Temporary password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
                        <button className="btn btn-primary" type="submit" disabled={busy || resetPw.length < PASSWORD_MIN}>Set</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {msg && <p className={`mt-2 text-sm ${msg.tone === 'err' ? 'text-rust' : 'text-field'}`} role="status">{msg.text}</p>}
        <p className="mt-2 text-xs text-stone-500">Each account has its own saved games. Disabling an account signs it out; deleting it also deletes its saves.</p>
      </Panel>

      <Panel title="Sign-ups">
        <fieldset className="space-y-1 text-sm" disabled={busy || !registration}>
          <legend className="mb-1">Who can create an account on the sign-in page:</legend>
          {([
            ['open', 'Anyone', 'Anyone who can open the game can create an account and play right away.'],
            ['approval', 'Anyone, after an admin approves', 'New accounts wait here until an admin approves them.'],
            ['off', 'Nobody', 'Only admins add accounts, below.'],
          ] as const).map(([mode, label, help]) => (
            <label key={mode} className="flex items-start gap-2">
              <input type="radio" name="registration" className="mt-1" checked={registration === mode}
                onChange={() => {
                  const before = registration;
                  setRegistration(mode);
                  void act(async () => setRegistration((await saveAccountSettings({ registration: mode })).registration), `Sign-ups: ${label.toLowerCase()}.`)
                    .then((ok) => { if (!ok) setRegistration(before); });
                }} />
              <span><b>{label}</b>: {help}</span>
            </label>
          ))}
        </fieldset>
        <p className="mt-2 text-xs text-stone-500">While the game is shared over a quick tunnel, anyone with the link reaches the sign-in page. New accounts are players; at most five sign-ups an hour come from one address.</p>
      </Panel>

      <Panel title="Add an account">
        <form className="flex flex-wrap items-end gap-3 text-sm" onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => createUser(username, password, role), `${username.trim().toLowerCase()} added. Give them the password; they choose their own at first sign-in.`)) { setUsername(''); setPassword(''); setRole('player'); }
        }}>
          <label>Username<input className="input mt-1 block w-48" aria-label="New username" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>Temporary password<input className="input mt-1 block w-56" aria-label="New user's temporary password" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <label>Role
            <select className="input mt-1 block" aria-label="New user's role" value={role} onChange={(e) => setRole(e.target.value as UserView['role'])}>
              <option value="player">Player</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy || username.trim().length < 3 || password.length < PASSWORD_MIN}>Add account</button>
        </form>
        <p className="mt-2 text-xs text-stone-500">Usernames: 3 to 32 letters, digits, dots, dashes or underscores. Passwords: at least {PASSWORD_MIN} characters. Admins can manage accounts and sharing.</p>
      </Panel>
    </div>
  );
}
