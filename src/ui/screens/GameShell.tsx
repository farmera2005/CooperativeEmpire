import { useEffect } from 'react';
import { balance, formatMonth, fiscalYearOf } from '../../engine/index';
import { money } from '../format';
import { useStore, type Tab } from '../store';
import { Dashboard } from './Dashboard';
import { MapScreen } from './MapScreen';
import { MarketsScreen } from './MarketsScreen';
import { MembersScreen } from './MembersScreen';
import { FinancialsScreen } from './FinancialsScreen';
import { BoardScreen } from './BoardScreen';
import { InboxScreen } from './InboxScreen';
import { SavesScreen } from './SavesScreen';
import { GrainScreen } from './GrainScreen';

const TABS: { id: Tab; label: string; key: string }[] = [
  { id: 'dashboard', label: 'Dashboard', key: '1' },
  { id: 'inbox', label: 'News & Inbox', key: '2' },
  { id: 'grain', label: 'Grain', key: '3' },
  { id: 'map', label: 'Map', key: '4' },
  { id: 'markets', label: 'Markets', key: '5' },
  { id: 'members', label: 'Members', key: '6' },
  { id: 'financials', label: 'Financials', key: '7' },
  { id: 'board', label: 'Board Room', key: '8' },
  { id: 'saves', label: 'Save / Load', key: '9' },
];

export function GameShell() {
  const game = useStore((s) => s.game)!;
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const endMonth = useStore((s) => s.endMonth);
  const advanceUntil = useStore((s) => s.advanceUntilAttention);
  const autosave = useStore((s) => s.autosaveStatus);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = TABS.find((x) => x.key === e.key);
      if (t) setTab(t.id);
      else if (e.key === 'e' || e.key === 'E') endMonth();
      else if (e.key === 'a' || e.key === 'A') advanceUntil();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab, endMonth, advanceUntil]);

  const unread = game.inbox.filter((i) => !i.read).length;
  const cash = balance(game.ledger, '1000');
  const line = -balance(game.ledger, '2000');
  const fy = fiscalYearOf(game.clock.monthIndex, game.setup.fiscalYearEndMonth);

  return (
    <div className="flex h-full">
      <nav className="flex w-52 shrink-0 flex-col border-r border-stone-300 bg-[#ece6d3]" aria-label="Screens">
        <div className="border-b border-stone-300 p-3">
          <div className="headline text-sm font-bold leading-tight">{game.coop.name}</div>
          <div className="text-xs text-stone-600">{game.world.towns[game.coop.homeTownId].name}</div>
        </div>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id}
            className={`flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#e0d8bf] ${tab === t.id ? 'bg-[#d9cfae] font-semibold' : ''}`}>
            <span>{t.label}</span>
            <span className="text-xs text-stone-500">{t.id === 'inbox' && unread ? <b className="rounded bg-rust px-1.5 text-white">{unread}</b> : t.key}</span>
          </button>
        ))}
        <div className="mt-auto p-3 text-xs text-stone-500">
          Keys: 1–9 screens, E end month, A advance until something needs attention.
          <div className="mt-1">{autosave}</div>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-6 border-b border-stone-300 bg-white px-4 py-2">
          <div>
            <div className="headline text-xl font-bold">{formatMonth(game.clock.monthIndex)}</div>
            <div className="text-xs text-stone-500">Fiscal {fy}</div>
          </div>
          <div className="num text-sm"><span className="text-stone-500">Cash</span> <b>{money(cash)}</b></div>
          <div className="num text-sm"><span className="text-stone-500">Line drawn</span> <b>{money(line)}</b> <span className="text-stone-500">of {money(Math.min(game.coop.finance.lineCommitment, game.coop.finance.borrowingBase || game.coop.finance.lineCommitment))}</span>
            {game.coop.finance.overLimit && <span className="ml-2 rounded bg-rust px-1.5 text-xs text-white">OVER LIMIT</span>}</div>
          <div className="ml-auto flex gap-2">
            <button className="btn" onClick={advanceUntil} title="Run months until news, a fiscal year end, or a decision needs you (A)">Advance until attention</button>
            <button className="btn btn-primary" onClick={endMonth} title="End the month (E)">End month ▸</button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-4">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'inbox' && <InboxScreen />}
          {tab === 'grain' && <GrainScreen />}
          {tab === 'map' && <MapScreen />}
          {tab === 'markets' && <MarketsScreen />}
          {tab === 'members' && <MembersScreen />}
          {tab === 'financials' && <FinancialsScreen />}
          {tab === 'board' && <BoardScreen />}
          {tab === 'saves' && <SavesScreen />}
        </main>
      </div>
    </div>
  );
}
