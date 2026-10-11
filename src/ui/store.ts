import { create } from 'zustand';
import {
  advanceMonth, advanceUntilAttention, applyCommand, DEFAULT_INTERRUPTS, newGame,
  type Command, type GameSetup, type GameState, type MonthSummary,
} from '../engine/index';
import { saveSlot } from '../persistence/saves';

export type Tab = 'dashboard' | 'map' | 'markets' | 'members' | 'financials' | 'board' | 'inbox' | 'saves';
export type Screen = 'title' | 'newGame' | 'game';

interface UiState {
  screen: Screen;
  tab: Tab;
  game: GameState | null;
  summaries: MonthSummary[];
  error: string | null;
  autosaveStatus: string;
  setScreen(s: Screen): void;
  setTab(t: Tab): void;
  start(setup: GameSetup): void;
  load(state: GameState): void;
  command(cmd: Command): void;
  endMonth(): void;
  advanceUntilAttention(): void;
  advanceMonths(n: number): void;
  clearError(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave(get: () => UiState, set: (p: Partial<UiState>) => void) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const g = get().game;
    if (!g) return;
    try {
      await saveSlot(g, `Autosave — ${g.coop.name}`, true);
      set({ autosaveStatus: 'Autosaved' });
    } catch (e) {
      set({ autosaveStatus: `Autosave failed: ${(e as Error).message}` });
    }
  }, 400);
}

export const useStore = create<UiState>((set, get) => ({
  screen: 'title',
  tab: 'dashboard',
  game: null,
  summaries: [],
  error: null,
  autosaveStatus: '',
  setScreen: (screen) => set({ screen }),
  setTab: (tab) => set({ tab }),
  start: (setup) => {
    try {
      const game = newGame(setup);
      set({ game, screen: 'game', tab: 'inbox', summaries: [] });
      scheduleAutosave(get, set);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  load: (game) => set({ game, screen: 'game', tab: 'dashboard', summaries: [] }),
  command: (cmd) => {
    const g = get().game;
    if (!g) return;
    const r = applyCommand(g, cmd);
    if (!r.ok) set({ error: r.messages.map((m) => m.text).join(' ') });
    else set({ game: r.state });
  },
  endMonth: () => {
    const g = get().game;
    if (!g) return;
    try {
      const r = advanceMonth(g, [], { strictInvariants: false });
      set({ game: r.state, summaries: [r.summary, ...get().summaries].slice(0, 24) });
      if (r.interrupts.some((i) => i.kind === 'invariant')) set({ error: `Accounting check failed: ${r.interrupts.find((i) => i.kind === 'invariant')?.text}` });
      scheduleAutosave(get, set);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  advanceUntilAttention: () => {
    const g = get().game;
    if (!g) return;
    try {
      const rs = advanceUntilAttention(g, DEFAULT_INTERRUPTS, 120);
      if (!rs.length) return;
      set({ game: rs[rs.length - 1].state, summaries: [...rs.map((r) => r.summary).reverse(), ...get().summaries].slice(0, 24), tab: 'inbox' });
      scheduleAutosave(get, set);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  advanceMonths: (n) => {
    let g = get().game;
    if (!g) return;
    const sums: MonthSummary[] = [];
    try {
      for (let i = 0; i < n && !g.outcome; i++) {
        const r = advanceMonth(g);
        g = r.state;
        sums.unshift(r.summary);
      }
      set({ game: g, summaries: [...sums, ...get().summaries].slice(0, 24) });
      scheduleAutosave(get, set);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  clearError: () => set({ error: null }),
}));
