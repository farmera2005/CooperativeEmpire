// Save schema migrations. Each entry upgrades a save from version N to N+1. Add one (with a
// fixture test) whenever SCHEMA_VERSION changes.

import { SCHEMA_VERSION, type GameState } from '../types';
import { emptyEquityProgram, emptyRegional } from '../finance/defaults';
import { emptyBoardActivity } from '../governance/board';
import { emptyPeople } from '../people/leaders';
import { BYLAWS_DEFAULT } from '../../data/governance';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

export const MIGRATIONS: Record<number, (s: AnyState) => AnyState> = {
  // v1 → v2 (Milestone 2): facilities, grain, competitors, lender, member shares.
  1: (s) => {
    for (const m of s.members.list) {
      m.share ??= {};
      m.ytd ??= {};
    }
    for (const d of s.world.destinations) {
      if (d.kind === 'processor' && !d.commodities) d.commodities = /soy/i.test(d.name) ? ['soybeans'] : ['corn', 'wheat'];
    }
    const lim = 25_000;
    const pos = () => ({ ownedBu: 0, book: 0, dpBu: 0, dpLiability: 0, openStorageBu: 0, shortBu: 0, lastFutures: 0 });
    s.coop = {
      ...s.coop,
      facilities: [], projects: [], assets: [], nextId: 1, offers: [],
      grainPolicy: { posture: 'market', hedgeRatio: 1, positionLimit: { corn: lim, soybeans: lim, wheat: lim }, offerOpenStorage: true, offerDelayedPrice: true, offerForward: true, storageFee: 1, dryingFee: 1, carryAppetite: 'normal' },
      grain: { pos: { corn: pos(), soybeans: pos(), wheat: pos() }, marginAccount: 0, basisNoise: { corn: 0, soybeans: 0, wheat: 0 }, report: null, reports: [] },
      finance: { lineCommitment: 0, borrowingBase: 0, lineAvailable: 0, overLimit: false, termLoans: [], nextLoanId: 1, lastLineRate: 0 },
      grainStats: { marketBu: 0, offeredBu: 0, priceAdvantage: 0 },
    };
    s.competitors ??= [];
    for (const h of s.history) {
      h.grainBu ??= 0;
      h.grainShare ??= 0;
      h.lineDrawn ??= 0;
    }
    return { ...s, schemaVersion: 2 };
  },
  // v2 → v3 (Milestone 3): supply divisions, facility kinds, patronage tracking.
  2: (s) => {
    const book = () => ({ inventory: {}, ar: { current: 0, past30: 0, past60: 0, past90: 0, harvest: 0 }, allowance: 0, prepay: 0, prebuyGal: 0, prebuyPrice: 0, rebatesAccrued: 0, rebateBase: 0, lateMemory: 0, townShare: {}, toll: null, report: null, reports: [] });
    const policy = () => ({ posture: 'market', credit: 'normal', prepayProgram: true, summerFillPct: 0.4, winterFillPct: 0.3, tollMilling: false, prebuyProgram: true, supplyCover: 'covered' });
    const divs = ['AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'];
    s.coop.supply = Object.fromEntries(divs.map((d) => [d, book()]));
    s.coop.supplyPolicy = Object.fromEntries(divs.map((d) => [d, policy()]));
    s.coop.patronageStats = Object.fromEntries(['GRAIN', ...divs, 'CORP'].map((d) => [d, { member: 0, nonmember: 0 }]));
    for (const o of s.coop.offers) o.kind ??= 'elevator';
    for (const c of s.competitors) for (const site of c.sites) site.division ??= 'GRAIN';
    return { ...s, schemaVersion: 3 };
  },
  // v3 → v4 (Milestone 4): patronage and equity program, regionals, lender standing, budget.
  3: (s) => {
    for (const m of s.members.list) m.patronage ??= [];
    s.coop.equityProgram = emptyEquityProgram();
    s.coop.regional = emptyRegional();
    s.coop.budget = null;
    const f = s.coop.finance;
    Object.assign(f, { status: 'standard', riskSpread: 0, breachQuarters: 0, okQuarters: 0, lastTest: null, lenderEquity: {}, loanSum: 0, loanMonths: 0, ...f });
    // Before v4 the fiscal year close sent net savings straight to unallocated retained earnings, so 3900 is empty.
    return { ...s, schemaVersion: 4 };
  },
  // v4 → v5 (Milestone 5): board meetings, votes, demands, reviews, elections, bylaws.
  4: (s) => {
    const g = s.governance;
    s.governance = {
      ...emptyBoardActivity(), ...g,
      bylaws: {
        quorumPct: BYLAWS_DEFAULT.quorumPct.value, capitalApproval: BYLAWS_DEFAULT.capitalApproval.value, memberPetitionPct: BYLAWS_DEFAULT.memberPetitionPct.value,
        termLimit: BYLAWS_DEFAULT.termLimit, ...g.bylaws,
      },
    };
    for (const h of s.history) h.boardConfidence ??= s.governance.boardConfidence;
    return { ...s, schemaVersion: 5 };
  },
  // v5 → v6 (Milestone 6): leaders, hiring, workforce, incidents.
  5: (s) => {
    s.people ??= emptyPeople();
    return { ...s, schemaVersion: 6 };
  },
  // v6 → v7 (Milestone 7): deals, joint ventures, events with choices, technology, regulation.
  6: (s) => {
    s.deals ??= [];
    s.jvs ??= [];
    s.integrationUntil ??= null;
    return { ...s, schemaVersion: 7 };
  },
};

export interface SaveFile {
  format: 'ag-coop-tycoon-save';
  schemaVersion: number;
  savedAt: string;
  slotName: string;
  state: GameState;
}

export class SaveError extends Error {}

export function migrate(raw: AnyState): GameState {
  if (!raw || typeof raw !== 'object' || typeof raw.schemaVersion !== 'number') throw new SaveError('Not a game state');
  let s = raw;
  while (s.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[s.schemaVersion];
    if (!step) throw new SaveError(`No migration from schema ${s.schemaVersion}`);
    s = step(s);
  }
  if (s.schemaVersion > SCHEMA_VERSION) throw new SaveError(`Save is from a newer version (schema ${s.schemaVersion})`);
  return s as GameState;
}

export function toSaveFile(state: GameState, slotName: string, savedAt: string): SaveFile {
  return { format: 'ag-coop-tycoon-save', schemaVersion: state.schemaVersion, savedAt, slotName, state };
}

export function serializeSave(file: SaveFile): string {
  return JSON.stringify(file);
}

export function parseSave(text: string): SaveFile {
  let raw: AnyState;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError('File is not valid JSON');
  }
  if (raw?.format !== 'ag-coop-tycoon-save') throw new SaveError('Not an Agricultural Cooperative Tycoon save file');
  return { ...raw, state: migrate(raw.state), schemaVersion: SCHEMA_VERSION };
}
