// Per-tick working context passed to every tick step.

import { monthOf, yearOf } from '../core/calendar';
import { stream, type Rng } from '../core/rng';
import type { GameState, InboxItem } from '../types';
import { pathFor } from '../world/macro';
import type { MarketPath } from '../world/marketPath';

export interface TickContext {
  /** Working copy; tick steps mutate it. */
  state: GameState;
  path: MarketPath;
  mi: number;
  year: number;
  month: number;
  rng(name: string, entity?: number | string): Rng;
  inbox(item: Omit<InboxItem, 'id' | 'monthIndex' | 'read'>): void;
  /** Lines for the month summary. */
  summary: string[];
}

export function makeContext(state: GameState, rngScope: string = ''): TickContext {
  const mi = state.clock.monthIndex;
  return {
    state,
    path: pathFor(state),
    mi,
    year: yearOf(mi),
    month: monthOf(mi),
    rng: (name, entity = 0) => stream(state.setup.gameSeed, mi, rngScope + name, entity),
    inbox: (item) => {
      state.inbox.push({ ...item, id: state.nextInboxId++, monthIndex: mi, read: false });
    },
    summary: [],
  };
}
