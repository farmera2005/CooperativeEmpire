import { AccountPanel } from './AccountScreens';
import { formatMonth } from '../../engine/index';
import { useStore } from '../store';

/** The game under way: enter debug mode (D-145). */
function GamePanel() {
  const game = useStore((s) => s.game);
  const command = useStore((s) => s.command);
  const setTab = useStore((s) => s.setTab);
  if (!game) return null;
  const on = !!game.setup.debugMode;
  const since = game.setup.debugSinceMonth;
  const enter = () => {
    if (!window.confirm('Enter debug mode? The game becomes a debug game for good: testing tools (add cash, set confidence and satisfaction, reset the lender, place managers, cancel a game over) are unlocked and the game is marked DEBUG GAME. This cannot be undone.')) return;
    if (command({ type: 'enterDebugMode' })) setTab('debug');
  };
  return (
    <section className="panel space-y-2 p-4 text-sm">
      <h2 className="font-semibold">This game: {game.coop.name}</h2>
      {on ? (
        <p>Debug mode is on{since !== undefined ? ` since ${formatMonth(since)}` : ' (chosen when the game was created)'}. The tools are on the <button className="underline" onClick={() => setTab('debug')}>Debug tools</button> screen (key X).</p>
      ) : (
        <>
          <p>Debug mode unlocks testing tools: add or remove cash, set board confidence and member satisfaction, reset the lender, reveal skills, place managers of any skill, and cancel a firing or liquidation. Entering it marks the game as a debug game from this month on, and it cannot be turned off. Save first if you want to keep a clean copy.</p>
          <button className="btn" onClick={enter}>Enter debug mode</button>
        </>
      )}
    </section>
  );
}

/** Settings: the signed-in account (D-127). Sharing moved to the admin menu. */
export default function SettingsScreen({ onBack }: { onBack?: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {onBack && <div className="flex items-center justify-between"><h1 className="headline text-3xl font-bold">Settings</h1><button className="btn" onClick={onBack}>Back</button></div>}
      {!onBack && <GamePanel />}
      <AccountPanel />
    </div>
  );
}
