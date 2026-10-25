import { useCallback, useEffect, useState } from 'react';
import { createUser, deleteUser, listUsers, PASSWORD_MIN, updateUser, type UserView } from '../accountClient';
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

  const refresh = useCallback(() => listUsers().then(setUsers).catch((e) => setMsg({ tone: 'err', text: (e as Error).message })), []);
  useEffect(() => { void refresh(); }, [refresh]);

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
      <Panel title="Accounts">
        <table className="data">
          <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td><b>{u.username}</b>{u.builtIn && <span className="ml-1 text-xs text-stone-500">(built-in)</span>}{self && <span className="ml-1 text-xs text-stone-500">(you)</span>}</td>
                  <td>
                    <select className="input" aria-label={`Role of ${u.username}`} value={u.role} disabled={busy || u.builtIn || self}
                      onChange={(e) => act(() => updateUser(u.id, { role: e.target.value as UserView['role'] }), `${u.username} is now ${e.target.value === 'admin' ? 'an admin' : 'a player'}.`)}>
                      <option value="player">Player</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{u.disabled ? <span className="text-rust">Disabled</span> : u.mustChangePassword ? 'Must set a password' : 'Active'}</td>
                  <td>{when(u.lastLoginAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {!self && <button className="btn" disabled={busy} onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setResetPw(''); }}>Reset password</button>}
                      {!u.builtIn && !self && (
                        <button className="btn" disabled={busy} onClick={() => act(() => updateUser(u.id, { disabled: !u.disabled }), `${u.username} ${u.disabled ? 'enabled' : 'disabled'}.`)}>{u.disabled ? 'Enable' : 'Disable'}</button>
                      )}
                      {!u.builtIn && !self && (
                        <button className="btn" disabled={busy} onClick={() => {
                          if (window.confirm(`Delete ${u.username} and all of their saved games? This cannot be undone.`)) void act(() => deleteUser(u.id), `${u.username} deleted.`);
                        }}>Delete</button>
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
