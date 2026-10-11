// Scripted policies for the headless balance runner. Each returns the commands a player
// following that policy would issue this month. They grow with each milestone.

import type { GameState } from '../types';
import type { Command } from './commands';

export type PolicyId = 'baseline' | 'reckless' | 'conservative' | 'idle';

export type Policy = (state: GameState) => Command[];

export const POLICIES: Record<PolicyId, Policy> = {
  // M1: no businesses exist yet, so every policy is idle. Later milestones fill these in.
  baseline: () => [],
  reckless: () => [],
  conservative: () => [],
  idle: () => [],
};
