// Converting data-file dollars (2024 base) into the nominal dollars of a game month.

import { DOLLAR_BASE_YEAR } from '../../data/tuning';
import { roundCents, type Cents } from '../core/money';
import { toMonthIndex } from '../core/calendar';
import type { GameState } from '../types';
import { annualAverage, getMarketPath, marketValue, type MarketPath } from './marketPath';

export function pathFor(state: GameState): MarketPath {
  return getMarketPath(state.setup.gameSeed, state.setup.historyMode, state.drift);
}

/** Multiplier from 2024 dollars to nominal dollars in month mi. */
export function priceLevel(path: MarketPath, mi: number): number {
  return marketValue(path, 'cpi', mi) / annualAverage(path, 'cpi', DOLLAR_BASE_YEAR);
}

/** Multiplier from 2024 construction dollars to nominal construction dollars in month mi. */
export function constructionLevel(path: MarketPath, mi: number): number {
  return marketValue(path, 'constructionIndex', mi) / annualAverage(path, 'constructionIndex', DOLLAR_BASE_YEAR);
}

/** 2024 dollars → nominal cents in the given month. */
export function nominalCents(path: MarketPath, mi: number, dollars2024: number): Cents {
  return roundCents(dollars2024 * priceLevel(path, mi) * 100);
}

export const yearStart = (y: number): number => toMonthIndex(y, 1);
