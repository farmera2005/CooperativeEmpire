import { useStore } from './store';
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
  return (
    <>
      {screen === 'title' && <TitleScreen />}
      {screen === 'newGame' && <NewGameScreen />}
      {screen === 'game' && <GameShell />}
      {screen === 'settings' && <main className="p-8"><SettingsScreen onBack={() => setScreen('title')} /></main>}
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
