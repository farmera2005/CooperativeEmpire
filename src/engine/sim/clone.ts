// Working-copy clone (D-003): everything deep-copied except append-only histories, whose
// existing elements are never mutated. The open ledger month is deep-copied because
// commands and the tick post into it.

import { deepClone } from '../core/clone';
import type { GameState } from '../types';

export function cloneState(s: GameState): GameState {
  const { ledger, history, ...rest } = s;
  const c = deepClone(rest) as GameState;
  const months = ledger.months.slice(0, -1);
  months.push(deepClone(ledger.months[ledger.months.length - 1]));
  c.ledger = { balances: { ...ledger.balances }, months, nextEntryId: ledger.nextEntryId, firstMonth: ledger.firstMonth };
  c.history = history.slice();
  return c;
}
