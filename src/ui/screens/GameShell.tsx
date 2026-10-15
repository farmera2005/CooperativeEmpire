import { useEffect } from 'react';
import { balance, formatMonth, fiscalYearOf, openDecisions, STATUS_LABEL } from '../../engine/index';
import { money } from '../format';
import { useStore, type Tab } from '../store';
import { GUIDE, guideProgress } from '../guide';
import { Dashboard } from './Dashboard';
import { MapScreen } from './MapScreen';
import { MarketsScreen } from './MarketsScreen';
import { MembersScreen } from './MembersScreen';
import { FinancialsScreen } from './FinancialsScreen';
import { BoardScreen } from './BoardScreen';
import { InboxScreen } from './InboxScreen';
import { SavesScreen } from './SavesScreen';
import { GrainScreen } from './GrainScreen';
import { SupplyScreen } from './SupplyScreen';
import { EquityScreen } from './EquityScreen';
import { LenderScreen } from './LenderScreen';
import { PeopleScreen } from './PeopleScreen';
import { DealsScreen } from './DealsScreen';
import { OperationsScreen } from './OperationsScreen';
import { ReportsScreen } from './ReportsScreen';
import { GlossaryScreen } from './GlossaryScreen';

const TABS: { id: Tab; label: string; key: string }[] = [
  { id: 'dashboard', label: 'Dashboard', key: '1' },
  { id: 'inbox', label: 'News & Inbox', key: '2' },
  { id: 'grain', label: 'Grain', key: '3' },
  { id: 'supply', label: 'Farm supply', key: '4' },
  { id: 'map', label: 'Map', key: '5' },
  { id: 'markets', label: 'Markets', key: '6' },
  { id: 'members', label: 'Members', key: '7' },
  { id: 'financials', label: 'Financials', key: '8' },
  { id: 'equity', label: 'Equity & Patronage', key: '9' },
  { id: 'lender', label: 'Regional & Lender', key: '0' },
  { id: 'operations', label: 'Operations & Tech', key: 'O' },
  { id: 'deals', label: 'Deals & Competitors', key: 'D' },
  { id: 'people', label: 'People', key: 'P' },
  { id: 'reports', label: 'Reports & Scorecard', key: 'R' },
  { id: 'board', label: 'Board Room', key: 'B' },
  { id: 'glossary', label: 'Glossary', key: 'G' },
  { id: 'saves', label: 'Save / Load', key: 'S' },
];

export function GameShell() {
  const game = useStore((s) => s.game)!;
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const endMonth = useStore((s) => s.endMonth);
  const advanceUntil = useStore((s) => s.advanceUntilAttention);
  const autosave = useStore((s) => s.autosaveStatus);
  const guideOn = useStore((s) => s.guide);
  const setGuide = useStore((s) => s.setGuide);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = TABS.find((x) => x.key === e.key.toUpperCase());
      if (t) setTab(t.id);
      else if (e.key === 'e' || e.key === 'E') endMonth();
      else if (e.key === 'a' || e.key === 'A') advanceUntil();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab, endMonth, advanceUntil]);

  const unread = game.inbox.filter((i) => !i.read).length;
  const decisions = openDecisions(game).length;
  const cash = balance(game.ledger, '1000');
  const line = -balance(game.ledger, '2000');
  const fy = fiscalYearOf(game.clock.monthIndex, game.setup.fiscalYearEndMonth);

  return (
    <div className="flex h-full">
      <a href="#main" className="skip-link">Skip to content</a>
      <nav className="flex w-52 shrink-0 flex-col border-r border-stone-300 bg-[#ece6d3]" aria-label="Screens">
        <div className="border-b border-stone-300 p-3">
          <div className="headline text-sm font-bold leading-tight">{game.coop.name}</div>
          <div className="text-xs text-stone-600">{game.world.towns[game.coop.homeTownId].name}</div>
        </div>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id}
            className={`flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#e0d8bf] ${tab === t.id ? 'bg-[#d9cfae] font-semibold' : ''}`}>
            <span>{t.label}</span>
            <span className="text-xs text-stone-500">{t.id === 'inbox' && (unread || decisions) ? <b className="rounded bg-rust px-1.5 text-white">{decisions ? `${decisions}!` : unread}</b> : t.key}</span>
          </button>
        ))}
        <div className="mt-auto p-3 text-xs text-stone-500">
          Keys: 0–9, O, D, P, R, B, G, S screens, E end month, A advance until something needs attention.
          <div className="mt-1">{autosave}</div>
          {!guideOn && <button className="mt-1 underline" onClick={() => setGuide(true)}>Show the first-year guide</button>}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-6 border-b border-stone-300 bg-white px-4 py-2">
          <div>
            <div className="headline text-xl font-bold" aria-live="polite">{formatMonth(game.clock.monthIndex)}</div>
            <div className="text-xs text-stone-500">Fiscal {fy}</div>
          </div>
          <div className="num text-sm"><span className="text-stone-500">Cash</span> <b>{money(cash)}</b></div>
          <div className="num text-sm"><span className="text-stone-500">Line drawn</span> <b>{money(line)}</b> <span className="text-stone-500">of {money(Math.min(game.coop.finance.lineCommitment, game.coop.finance.borrowingBase || game.coop.finance.lineCommitment))}</span>
            {game.coop.finance.overLimit && <span className="ml-2 rounded bg-rust px-1.5 text-xs text-white">OVER LIMIT</span>}
            {game.coop.finance.status !== 'standard' && <button className="ml-2 rounded bg-rust px-1.5 text-xs text-white" onClick={() => setTab('lender')}>{STATUS_LABEL[game.coop.finance.status].toUpperCase()}</button>}</div>
          <div className="ml-auto flex gap-2">
            <button className="btn" onClick={advanceUntil} title="Run months until news, a fiscal year end, or a decision needs you (A)">Advance until attention</button>
            <button className="btn btn-primary" onClick={endMonth} title="End the month (E)">End month ▸</button>
          </div>
        </header>
        {game.outcome && <GameOver />}
        <GuidePanel />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-auto p-4">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'inbox' && <InboxScreen />}
          {tab === 'grain' && <GrainScreen />}
          {tab === 'supply' && <SupplyScreen />}
          {tab === 'map' && <MapScreen />}
          {tab === 'markets' && <MarketsScreen />}
          {tab === 'members' && <MembersScreen />}
          {tab === 'financials' && <FinancialsScreen />}
          {tab === 'equity' && <EquityScreen />}
          {tab === 'lender' && <LenderScreen />}
          {tab === 'operations' && <OperationsScreen />}
          {tab === 'deals' && <DealsScreen />}
          {tab === 'people' && <PeopleScreen />}
          {tab === 'reports' && <ReportsScreen />}
          {tab === 'board' && <BoardScreen />}
          {tab === 'glossary' && <GlossaryScreen />}
          {tab === 'saves' && <SavesScreen />}
        </main>
      </div>
    </div>
  );
}

function GameOver() {
  const game = useStore((s) => s.game)!;
  const setTab = useStore((s) => s.setTab);
  const setScreen = useStore((s) => s.setScreen);
  const o = game.outcome!;
  const title = o.kind === 'fired' ? 'The board has let you go' : o.kind === 'liquidated' ? 'The lender forced a sale' : 'The co-op has been absorbed';
  return (
    <div role="alert" className="border-b-4 border-rust bg-[#f6e3dc] px-4 py-3">
      <div className="headline text-lg font-bold text-rust">{title} — {formatMonth(o.monthIndex)}</div>
      <p className="text-sm">{o.text}</p>
      <div className="mt-2 flex gap-2">
        <button className="btn" onClick={() => setTab('saves')}>Load an earlier save</button>
        <button className="btn" onClick={() => setScreen('title')}>Title screen</button>
        <span className="self-center text-xs text-stone-500">The books stay open for review; months can no longer be played.</span>
      </div>
    </div>
  );
}

function GuidePanel() {
  const game = useStore((s) => s.game)!;
  const on = useStore((s) => s.guide);
  const visited = useStore((s) => s.visited);
  const setGuide = useStore((s) => s.setGuide);
  const setTab = useStore((s) => s.setTab);
  if (!on) return null;
  const { step, index } = guideProgress(game, visited);
  return (
    <aside aria-label="Guide" className="flex items-start gap-3 border-b border-stone-300 bg-[#eef3e8] px-4 py-2 text-sm">
      {step ? (
        <>
          <span className="mt-0.5 shrink-0 rounded bg-field px-1.5 text-xs text-white">{index + 1}/{GUIDE.length}</span>
          <div className="min-w-0 flex-1"><b>{step.title}.</b> {step.text}</div>
          <button className="btn shrink-0 text-xs" onClick={() => setTab(step.tab)}>Show me</button>
        </>
      ) : (
        <div className="flex-1"><b>Your first year is done.</b> You know your way around. Good luck with the next fifty.</div>
      )}
      <button className="shrink-0 text-xs underline" onClick={() => setGuide(false)}>Hide guide</button>
    </aside>
  );
}
