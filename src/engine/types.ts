// Core game state. Plain, JSON-serializable data only (no classes, Maps or typed arrays),
// so saves are simple and cloning is predictable.

import type { Cents } from './core/money';
import type { SeriesId } from '../data/markets';
import type { CropId, SpeciesId } from '../data/regions/eccb';
import type { ComponentId, LoadoutType } from '../data/facilities';
import type { Commodity } from '../data/grain';
import type { Breakdown } from './core/breakdown';

export const SCHEMA_VERSION = 2;

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
  /** Commodities accepted (omitted = all). */
  commodities?: Commodity[];
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
  /** The co-op's share of this farm's business, by product line (0..1). */
  share: Record<string, number>;
  /** Fiscal-year-to-date volume with the co-op, by product line (bu, tons, gal...). */
  ytd: Record<string, number>;
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

export type Posture = 'aggressive' | 'market' | 'premium';
export type StaffLevel = 'lean' | 'standard' | 'full';
export type PayPosition = 'below' | 'at' | 'above';

export interface FacilityGrainState {
  /** Physical bushels in the house by commodity (owned + DP + open storage). */
  bu: Record<Commodity, number>;
  /** Harvest-wait memory (hours, EMA across harvests) that farmers use to judge service. */
  waitMemory: number;
  /** This season's worst weekly wait and turned-away bushels. */
  seasonMaxWait: number;
  seasonTurnedAway: number;
  /** Season wait-hours × bushels and bushels offered, for the average wait. */
  seasonWaitBu: number;
  seasonOfferedBu: number;
  /** Weeks of breakdown remaining. */
  downWeeks: number;
}

export interface Facility {
  id: number;
  name: string;
  townId: number;
  division: DivisionId;
  kind: 'elevator';
  ownership: 'owned' | 'leased';
  status: 'underConstruction' | 'operating' | 'mothballed' | 'closed';
  builtYear: number;
  acquiredMonth: number;
  condition: number;
  /** Installed component quantities in each component's unit (bu, bu/hr, count, acres). */
  components: Partial<Record<ComponentId, number>>;
  staffing: { level: StaffLevel; pay: PayPosition };
  /** Known or hidden environmental liability (cents). */
  envLiability?: { cost: Cents; discovered: boolean };
  grain: FacilityGrainState;
}

export interface CapitalProject {
  id: number;
  facilityId: number;
  label: string;
  components: Partial<Record<ComponentId, number>>;
  budget: Cents;
  spent: Cents;
  startMonth: number;
  completeMonth: number;
  /** Renovation projects restore condition instead of adding components. */
  renovation?: boolean;
}

export interface FixedAsset {
  id: number;
  facilityId: number;
  label: string;
  account: '1500' | '1510' | '1520' | '1530';
  cost: Cents;
  accumDep: Cents;
  lifeMonths: number; // 0 = not depreciated (land)
  startMonth: number;
}

export interface GrainPolicy {
  posture: Posture;
  /** Target share of net owned bushels hedged with futures (1 = fully hedged). */
  hedgeRatio: number;
  /** Board limit on net open bushels per commodity. */
  positionLimit: Record<Commodity, number>;
  offerOpenStorage: boolean;
  offerDelayedPrice: boolean;
  offerForward: boolean;
  /** Fee multipliers vs the standard schedule. */
  storageFee: number;
  dryingFee: number;
  carryAppetite: 'low' | 'normal' | 'high';
}

export interface CommodityPosition {
  ownedBu: number;
  /** Carrying value of owned bushels in account 1200 (cents). */
  book: Cents;
  dpBu: number;
  /** Unpriced delayed-price liability in account 2110 (cents). */
  dpLiability: Cents;
  openStorageBu: number;
  /** Futures sold to hedge (bushels, positive = short). */
  shortBu: number;
  /** Futures price at which the position was last marked. */
  lastFutures: number;
}

export interface GrainCommodityMonth {
  futures: number;
  localBasis: number;
  ourBid: number;
  bestSaleNet: number;
  carry: number;
  offeredBu: number;
  receivedBu: number;
  turnedAwayBu: number;
  purchasedBu: number;
  shippedBu: number;
  shippedVia: Record<string, number>;
  salesCents: Cents;
  openPositionBu: number;
  overLimit: boolean;
}

export interface GrainMonthReport {
  monthIndex: number;
  byCommodity: Record<Commodity, GrainCommodityMonth>;
  maxWaitHours: number;
  grossMargin: Breakdown;
  marginCall: Cents;
}

export interface GrainBook {
  pos: Record<Commodity, CommodityPosition>;
  /** Futures margin on deposit (account 1310). */
  marginAccount: Cents;
  /** AR(1) state of destination basis noise (2024 $/bu). */
  basisNoise: Record<Commodity, number>;
  report: GrainMonthReport | null;
  /** Rolling 24 months of reports for charts. */
  reports: GrainMonthReport[];
}

export interface FacilityOffer {
  id: number;
  competitorId: number | null;
  townId: number;
  sellerName: string;
  components: Partial<Record<ComponentId, number>>;
  builtYear: number;
  /** True condition (hidden until due diligence) and the seller's estimate shown to the player. */
  condition: number;
  conditionEstimate: [number, number];
  price: Cents;
  expiresMonth: number;
  diligenceDone: boolean;
  envLiability: Cents;
  envFound: boolean;
}

export interface TermLoan {
  id: number;
  purpose: string;
  principal: Cents;
  balance: Cents;
  ratePct: number;
  payment: Cents;
  startMonth: number;
  months: number;
}

export interface FinanceState {
  lineCommitment: Cents;
  borrowingBase: Cents;
  lineAvailable: Cents;
  overLimit: boolean;
  termLoans: TermLoan[];
  nextLoanId: number;
  lastLineRate: number;
}

export interface CoopState {
  name: string;
  homeTownId: number;
  foundedMonth: number;
  lenderId: string;
  regionalAffiliations: GameSetup['regionalAffiliations'];
  minCash: Cents;
  facilities: Facility[];
  projects: CapitalProject[];
  assets: FixedAsset[];
  nextId: number;
  grainPolicy: GrainPolicy;
  grain: GrainBook;
  offers: FacilityOffer[];
  finance: FinanceState;
  grainStats: { marketBu: number; offeredBu: number; priceAdvantage: number };
}

// ---------- Competitors ----------

export interface CompetitorSite {
  id: number;
  townId: number;
  storageBu: number;
  receiveBuHr: number;
  dryBuHr: number;
  loadout: LoadoutType;
  builtYear: number;
  condition: number;
}

export interface Competitor {
  id: number;
  name: string;
  kind: 'independent' | 'coop' | 'national';
  brandId?: string;
  sites: CompetitorSite[];
  /** Bid adjustment vs the local market (2024 $/bu; positive bids more). */
  posture: number;
  /** Service quality −1..1. */
  service: number;
  status: 'active' | 'sold' | 'failed';
  ownerAge: number;
  /** Season bushels handled (for reports). */
  volumeYtd: number;
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
  grainBu: number;
  grainShare: number;
  lineDrawn: Cents;
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
  competitors: Competitor[];
  inbox: InboxItem[];
  nextInboxId: number;
  firedEvents: FiredEvent[];
  history: MonthSnapshot[];
  outcome: null | { kind: 'fired' | 'liquidated' | 'absorbed'; monthIndex: number; text: string };
}
