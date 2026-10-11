// Core game state. Plain, JSON-serializable data only (no classes, Maps or typed arrays),
// so saves are simple and cloning is predictable.

import type { Cents } from './core/money';
import type { SeriesId } from '../data/markets';
import type { CropId, SpeciesId } from '../data/regions/eccb';

export const SCHEMA_VERSION = 1;

export type DivisionId = 'GRAIN' | 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL' | 'CORP';
export const DIVISIONS: DivisionId[] = ['GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL', 'CORP'];

export type HistoryMode = 'strict' | 'drift';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type CapitalPreset = 'shoestring' | 'typical' | 'well' | 'custom';

export interface GameSetup {
  coopName: string;
  startYear: number;
  startingMembers: number;
  capitalPreset: CapitalPreset;
  /** Used when capitalPreset is 'custom' (nominal dollars, in cents). */
  customCapital?: Cents;
  fiscalYearEndMonth: number;
  difficulty: Difficulty;
  mapSeed: number;
  gameSeed: number;
  historyMode: HistoryMode;
  regionId: string;
  fictionalizeBrands: boolean;
  /** Founding choices. */
  lenderId: string;
  regionalAffiliations: { regionalId: string; lines: ('grain' | 'agronomy' | 'feed' | 'energy' | 'retail')[] }[];
  homeTownId?: number;
}

// ---------- World ----------

export interface Town {
  id: number;
  name: string;
  countyId: number;
  x: number; // miles
  y: number; // miles
  population: number;
  isCountySeat: boolean;
  onHighway: boolean;
  railLineIds: number[];
  districtId: number;
}

export interface County {
  id: number;
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  seatTownId: number;
}

export interface Road {
  a: number;
  b: number;
  miles: number;
  major: boolean;
}

export interface RailLine {
  id: number;
  name: string;
  ownerBrandId: string;
  kind: 'mainline' | 'branch';
  townIds: number[];
  /** Points beyond the map edges for drawing main lines [x,y][]. */
  path: [number, number][];
  abandonmentRisk: number;
  status: 'active' | 'abandoned';
}

export interface Destination {
  id: number;
  name: string;
  kind: 'riverTerminal' | 'processor' | 'exportRail' | 'feeder' | 'ethanol';
  /** Off-map anchor for drawing and trucking distance from nearest edge town. */
  x: number;
  y: number;
  milesFromEdge: number;
}

export interface District {
  id: number;
  name: string;
  townIds: number[];
}

export interface WeatherState {
  /** Workable field days for each of the 4 weekly sub-steps this month. */
  fieldDays: number[];
  hdd: number;
  hddNormal: number;
  wetSpring: boolean;
  wetFall: boolean;
  harvestMoisture: number;
}

export interface WorldState {
  regionId: string;
  width: number;
  height: number;
  counties: County[];
  towns: Town[];
  roads: Road[];
  rail: RailLine[];
  destinations: Destination[];
  districts: District[];
  /** distances[i][j] road miles between towns i and j (by index = id). */
  distances: number[][];
  weather: WeatherState;
}

// ---------- Markets ----------

export interface DriftEntry {
  shiftMonths: number;
  magnitude: number;
}
export type DriftPlan = Record<string, DriftEntry>;

export interface MarketState {
  /** Current month values for every series available this month. */
  current: Partial<Record<SeriesId, number>>;
  /** Previous month (for change display). */
  previous: Partial<Record<SeriesId, number>>;
}

// ---------- Members ----------

export type MemberStatus = 'active' | 'retired' | 'deceased';

export interface Grievance {
  kind: string;
  division: DivisionId;
  month: number;
  severity: number;
}

export interface Member {
  id: number;
  name: string;
  female: boolean;
  birthYear: number;
  townId: number;
  districtId: number;
  kind: 'member' | 'nonmember';
  status: MemberStatus;
  joinedMonth: number;
  exitMonth?: number;
  acres: Record<CropId, number>;
  livestock: Record<SpeciesId, number>;
  sizeClass: 'small' | 'mid' | 'large' | 'mega';
  loyalty: number;
  priceSens: number;
  serviceSens: number;
  creditNeed: number;
  satisfaction: number;
  grievances: Grievance[];
  relationship: Partial<Record<DivisionId, number>>;
  successorOf?: number;
  isDirector: boolean;
  /** Farms represented by this record (D-010). */
  weight: number;
}

export interface MemberStore {
  list: Member[];
  nextId: number;
}

// ---------- Ledger ----------

export interface JournalLine {
  account: string;
  division: DivisionId;
  amount: Cents; // +debit, -credit
  memberId?: number;
  ref?: string;
}

export interface JournalEntry {
  id: number;
  monthIndex: number;
  source: string;
  memo: string;
  closing?: boolean;
  lines: JournalLine[];
}

export interface MonthLedger {
  monthIndex: number;
  /** Net activity by "account|division", excluding closing entries. */
  activity: Record<string, Cents>;
  /** Net activity of closing entries. */
  closing: Record<string, Cents>;
  /** Detail; dropped for old fiscal years (D-007). */
  entries: JournalEntry[] | null;
}

export interface LedgerState {
  /** Running balances by "account|division". */
  balances: Record<string, Cents>;
  months: MonthLedger[];
  nextEntryId: number;
  /** First month index covered by `months[0]`. */
  firstMonth: number;
}

// ---------- Equity ----------

export interface EquitySubledger {
  /** memberId -> stock in cents. */
  commonStock: Record<number, Cents>;
  preferredStock: Record<number, Cents>;
  /** memberId -> { vintageFY -> [qualified, nonqualified] }. Filled from M4. */
  allocated: Record<number, Record<number, [Cents, Cents]>>;
}

// ---------- Governance ----------

export interface PetIssue {
  kind: 'hometown' | 'redemption' | 'division' | 'merger' | 'patronageCash' | 'conservative';
  townId?: number;
  division?: DivisionId;
  favor?: boolean;
}

export interface Director {
  memberId: number;
  districtId: number | null; // null = at large
  termEndYear: number;
  stance: number; // -1 conservative .. +1 growth
  literacy: number; // 1..20
  loyaltyToGM: number; // 0..100
  tenureYears: number;
  petIssues: PetIssue[];
  office?: 'chair' | 'vice' | 'secretary';
}

export interface GovernanceState {
  bylaws: {
    boardSize: number;
    districts: number;
    atLargeSeats: number;
    termYears: number;
    supermajority: number;
  };
  directors: Director[];
  boardConfidence: number;
}

// ---------- Inbox / events ----------

export interface InboxItem {
  id: number;
  monthIndex: number;
  kind: 'news' | 'history' | 'memo' | 'alert';
  title: string;
  body: string;
  read: boolean;
  eventId?: string;
}

export interface FiredEvent {
  id: string;
  monthIndex: number;
}

// ---------- Co-op ----------

export interface CoopState {
  name: string;
  homeTownId: number;
  foundedMonth: number;
  lenderId: string;
  regionalAffiliations: GameSetup['regionalAffiliations'];
  minCash: Cents;
}

// ---------- History snapshots ----------

export interface MonthSnapshot {
  monthIndex: number;
  cash: Cents;
  totalAssets: Cents;
  equity: Cents;
  netSavingsMonth: Cents;
  activeMembers: number;
  activeFarms: number;
  totalAcres: number;
  avgSatisfaction: number;
}

// ---------- Game ----------

export interface GameState {
  schemaVersion: number;
  setup: GameSetup;
  clock: { monthIndex: number; startMonth: number; commandsThisMonth: number };
  drift: DriftPlan;
  world: WorldState;
  markets: MarketState;
  members: MemberStore;
  ledger: LedgerState;
  equity: EquitySubledger;
  governance: GovernanceState;
  coop: CoopState;
  inbox: InboxItem[];
  nextInboxId: number;
  firedEvents: FiredEvent[];
  history: MonthSnapshot[];
  outcome: null | { kind: 'fired' | 'liquidated' | 'absorbed'; monthIndex: number; text: string };
}
