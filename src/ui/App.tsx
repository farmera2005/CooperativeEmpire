import { useEffect } from 'react';
import { useStore } from './store';
import { fetchSession } from './accountClient';
import { ForcedPasswordScreen, LoginScreen } from './screens/AccountScreens';
import { AdminMenu } from './components/AdminMenu';
import { TitleScreen } from './screens/TitleScreen';
import { NewGameScreen } from './screens/NewGameScreen';
import { GameShell } from './screens/GameShell';
import SettingsScreen from './screens/SettingsScreen';

export function App() {
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const account = useStore((s) => s.account);
  const setAccount = useStore((s) => s.setAccount);
  useEffect(() => { void fetchSession().then(setAccount); }, [setAccount]);
  // With the game server, everyone signs in (D-127); without it, one player and browser saves.
  const gate = account.mode === 'checking' ? 'checking' : account.mode === 'server' && !account.user ? 'login' : account.user?.mustChangePassword ? 'password' : null;
  const isAdmin = account.user?.role === 'admin';
  return (
    <>
      {gate === 'checking' && <main className="p-8 text-stone-500">Loading…</main>}
      {gate === 'login' && <LoginScreen />}
      {gate === 'password' && <ForcedPasswordScreen />}
      {!gate && screen === 'title' && <TitleScreen />}
      {!gate && screen === 'newGame' && <NewGameScreen />}
      {!gate && screen === 'game' && <GameShell />}
      {!gate && screen === 'settings' && <main className="p-8"><SettingsScreen onBack={() => setScreen('title')} /></main>}
      {!gate && screen === 'admin' && isAdmin && (
        <main className="mx-auto max-w-5xl space-y-4 p-8">
          <div className="flex items-center justify-between"><h1 className="headline text-3xl font-bold">Admin menu</h1><button className="btn" onClick={() => setScreen('title')}>Back</button></div>
          <AdminMenu />
        </main>
      )}
      <div className="fixed bottom-4 left-56 z-50 flex w-[28rem] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} onClick={() => dismiss(t.id)} className={`rounded border bg-white p-2 text-left text-sm shadow ${t.level === 'error' ? 'border-rust text-rust' : t.level === 'warning' ? 'border-grain' : 'border-field'}`}>
            {t.text}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-lg rounded border border-rust bg-white p-3 text-sm shadow-lg">
          <div className="font-semibold text-rust">Something went wrong</div>
          <div className="mt-1 whitespace-pre-wrap">{error}</div>
          <button className="btn mt-2" onClick={clearError}>Dismiss</button>
        </div>
      )}
    </>
  );
}
