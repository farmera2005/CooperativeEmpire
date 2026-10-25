import { useState } from 'react';
import { changePassword, fetchSession, PASSWORD_MIN, register, signIn, signOut } from '../accountClient';
import { Panel } from '../components/Panel';
import { useStore } from '../store';

/** Sign-in, shown before anything else when the game server keeps accounts (D-127), with sign-up when allowed (D-128). */
export function LoginScreen() {
  const setAccount = useStore((s) => s.setAccount);
  const registration = useStore((s) => s.account.registration ?? 'off');
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const signingUp = creating && registration !== 'off';
  const problem = signingUp && password && password.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters.`
    : signingUp && again && password !== again ? 'The passwords do not match.' : '';
  const switchTo = (create: boolean) => { setCreating(create); setErr(''); setNote(''); setPassword(''); setAgain(''); };
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-8">
      <header>
        <div className="text-sm uppercase tracking-[0.3em] text-field">A farmer-owned business simulation</div>
        <h1 className="headline mt-2 text-4xl font-bold">Agricultural Cooperative Tycoon</h1>
      </header>
      <form className="panel space-y-3 p-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr('');
        setNote('');
        try {
          if (signingUp) {
            const r = await register(username, password);
            if (r.user) setAccount({ mode: 'server', user: r.user });
            else {
              switchTo(false);
              setNote('Account created. An admin needs to approve it before you can sign in.');
            }
          } else setAccount({ mode: 'server', user: await signIn(username, password) });
        } catch (x) {
          setErr((x as Error).message);
          if (!signingUp) setPassword('');
        } finally {
          setBusy(false);
        }
      }}>
        <h2 className="headline text-xl font-bold">{signingUp ? 'Create an account' : 'Sign in'}</h2>
        <label className="block text-sm">Username
          <input className="input mt-1 block w-full" name="username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="block text-sm">Password
          <input className="input mt-1 block w-full" name="password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {signingUp && (
          <label className="block text-sm">Password again
            <input className="input mt-1 block w-full" name="password-again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </label>
        )}
        {signingUp && <p className="text-xs text-stone-500">Usernames: 3 to 32 letters, digits, dots, dashes or underscores. Passwords: at least {PASSWORD_MIN} characters, without the username.{registration === 'approval' ? ' An admin approves new accounts before they can sign in.' : ''}</p>}
        {(err || problem) && <p className="text-sm text-rust" role="alert">{err || problem}</p>}
        {note && <p className="text-sm text-field" role="status">{note}</p>}
        <button className="btn btn-primary w-full py-2" type="submit"
          disabled={busy || !username.trim() || !password || (signingUp && (password.length < PASSWORD_MIN || password !== again))}>
          {busy ? (signingUp ? 'Creating…' : 'Signing in…') : signingUp ? 'Create account' : 'Sign in'}
        </button>
        {registration !== 'off' && (
          <p className="text-center text-sm">
            {signingUp
              ? <>Already have an account? <button type="button" className="text-sky underline" onClick={() => switchTo(false)}>Sign in</button></>
              : <>New here? <button type="button" className="text-sky underline" onClick={() => switchTo(true)}>Create an account</button></>}
          </p>
        )}
        <p className="text-xs text-stone-500">Each account keeps its own saved games. {registration === 'off' ? 'Ask the game\'s admin for an account or a password reset.' : 'Forgot your password? Ask the game\'s admin to reset it.'}</p>
      </form>
    </main>
  );
}

/** Choose a new password; required while the account has a temporary one. */
export function ChangePasswordForm({ forced = false, onDone }: { forced?: boolean; onDone?: () => void }) {
  const user = useStore((s) => s.account.user);
  const setAccount = useStore((s) => s.setAccount);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = next && next.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters.` : again && next !== again ? 'The new passwords do not match.' : '';
  return (
    <form className="space-y-3 text-sm" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setMsg(null);
      try {
        const u = await changePassword(current, next);
        setCurrent(''); setNext(''); setAgain('');
        setMsg({ tone: 'ok', text: 'Password changed.' });
        setAccount({ mode: 'server', user: u });
        onDone?.();
      } catch (x) {
        setMsg({ tone: 'err', text: (x as Error).message });
      } finally {
        setBusy(false);
      }
    }}>
      {/* Lets password managers file the new password under the right account. */}
      <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
      <label className="block">{forced ? 'Temporary password' : 'Current password'}
        <input className="input mt-1 block w-full" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block">New password
        <input className="input mt-1 block w-full" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="block">New password again
        <input className="input mt-1 block w-full" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {(problem || msg) && <p className={problem || msg?.tone === 'err' ? 'text-rust' : 'text-field'} role="status">{problem || msg?.text}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !current || next.length < PASSWORD_MIN || next !== again}>Change password</button>
    </form>
  );
}

/** Shown after signing in with a temporary password: nothing else opens until it is replaced. */
export function ForcedPasswordScreen() {
  const user = useStore((s) => s.account.user)!;
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-8">
      <div className="panel space-y-3 p-4">
        <h1 className="headline text-2xl font-bold">Choose your password</h1>
        <p className="text-sm text-stone-600">
          {user.builtIn
            ? 'The built-in admin account starts with a temporary password. Choose your own before going on; keep it safe, since this account manages every other account and the sharing settings.'
            : `Welcome, ${user.username}. Your account has a temporary password; choose your own to go on.`}
        </p>
        <ChangePasswordForm forced />
        <SignOutButton className="text-xs underline" />
      </div>
    </main>
  );
}

export function SignOutButton({ className = 'btn' }: { className?: string }) {
  const setAccount = useStore((s) => s.setAccount);
  return (
    <button className={className} type="button" onClick={async () => {
      try { await signOut(); } catch { /* signed out locally either way */ }
      // Ask again, so the sign-in page shows the current sign-up setting.
      const s = await fetchSession();
      setAccount(s.mode === 'server' ? s : { mode: 'server', user: null });
    }}>Sign out</button>
  );
}

/** The signed-in account, for the Settings screen. */
export function AccountPanel() {
  const account = useStore((s) => s.account);
  if (account.mode !== 'server' || !account.user) {
    return (
      <Panel title="Account">
        <p className="text-sm text-stone-600">
          This copy of the game is served without accounts, so it has one player and keeps saves in this browser. Accounts, each with
          its own saves, and the admin menu come with the game's own server: <code>npm run dev</code>, <code>npm run preview</code>,
          <code> npm run share</code>, or <code>docker compose up --build</code>.
        </p>
      </Panel>
    );
  }
  const u = account.user;
  return (
    <Panel title="Account" right={<SignOutButton />}>
      <p className="text-sm">Signed in as <b>{u.username}</b> ({u.role === 'admin' ? 'admin' : 'player'}). Your saved games are kept on the game server under this account.</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold">Change password</summary>
        <div className="mt-2 max-w-sm"><ChangePasswordForm /></div>
      </details>
    </Panel>
  );
}
