import { useStore } from './store';
import { TitleScreen } from './screens/TitleScreen';
import { NewGameScreen } from './screens/NewGameScreen';
import { GameShell } from './screens/GameShell';

export function App() {
  const screen = useStore((s) => s.screen);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  return (
    <>
      {screen === 'title' && <TitleScreen />}
      {screen === 'newGame' && <NewGameScreen />}
      {screen === 'game' && <GameShell />}
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
