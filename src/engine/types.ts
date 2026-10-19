// Core game state. Plain, JSON-serializable data only (no classes, Maps or typed arrays),
// so saves are simple and cloning is predictable.

import type { Cents } from './core/money';
import type { SeriesId } from '../data/markets';
import type { CropId, SpeciesId } from '../data/regions/eccb';
import type { ComponentId, FacilityKind, LoadoutType } from '../data/facilities';
import type { LineId, SupplyDivision } from '../data/supply';
import type { Commodity } from '../data/grain';
import type { Breakdown } from './core/breakdown';
import type { Role, Skill, TraitId } from '../data/people';

export const SCHEMA_VERSION = 8;

export type DivisionId = 'GRAIN' | 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL' | 'CORP';
export const DIVISIONS: DivisionId[] = ['GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL', 'CORP'];

export type HistoryMode = 'strict' | 'drift';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type CapitalPreset = 'shoestring' | 'typical' | 'well' | 'custom';

export interface GameSetup {
  coopName: string;
  startYear: number;
  startingMembers: number;
  /**
   * Farm customers in the trade area, members and non-members together (D-108). Founding
   * members are part of it; the rest start as non-member customers. Defaults from the members.
   */
  territoryCustomers?: number;
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
  /** Set when the game began as a scenario (DESIGN §19). */
  scenarioId?: string;
  /** Debug mode (D-105): testing tools on the Debug screen. Chosen at creation only. */
  debugMode?: boolean;
  /** Debug: firing and liquidation are cancelled and play continues. */
  debugNoGameOver?: boolean;
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
  /** Patronage allocated in recent fiscal years (newest last, at most 10). */
  patronage: { fy: number; cents: Cents }[];
}

export interface MemberStore {
  list: Member[];
  nextId: number;
  /** Customers who joined and members who resigned, by month (last 24 months; D-108). */
  flow?: { monthIndex: number; joined: number; left: number }[];
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

export interface Bylaws {
  boardSize: number;
  districts: number;
  atLargeSeats: number;
  termYears: number;
  /** Maximum consecutive terms (null = none). */
  termLimit: number | null;
  supermajority: number;
  quorumPct: number;
  /** Capital projects at or above this cost (2024 $) need a board vote. */
  capitalApproval: number;
  memberPetitionPct: number;
}

export type ProposalType =
  | 'capitalProject' | 'facilityClosure' | 'patronage' | 'redemptionPolicy' | 'budget' | 'affiliationChange'
  | 'lenderChange' | 'borrowing' | 'riskPolicy' | 'creditPolicy' | 'bylawRecommendation' | 'deal';

export type BylawChange =
  | { field: 'boardSize'; value: number }
  | { field: 'termLimit'; value: number | null }
  | { field: 'capitalApproval'; value: number }
  | { field: 'memberPetitionPct'; value: number };

export interface MeritVector {
  /** What a careful reader of the numbers concludes (−1..1). */
  trueMerit: number;
  /** What the headline suggests to a director who doesn't read the packet (−1..1). */
  headlineMerit: number;
  riskScore: number;
  /** Cash to members (+) or retained (−), −1..1. */
  memberCashEffect: number;
  equityRatioAfter: number;
  covenantHeadroom: number;
  townEffects: Record<number, number>;
  divisionEffects: Partial<Record<DivisionId, number>>;
  /** +1 expansion/growth, −1 retrenchment. */
  growth: number;
  controversy: number;
  notes: string[];
}

export interface AgendaItem {
  id: number;
  type: ProposalType;
  title: string;
  submittedMonth: number;
  /** The command to execute if the board approves (GM proposals). */
  command?: unknown;
  bylaw?: BylawChange;
  source: 'gm' | 'system';
  tabled: number;
  attempts: number;
  /** Directors (member ids) the GM lobbied for this item. */
  lobbied: number[];
}

export interface DirectorVote {
  memberId: number;
  yes: boolean;
  support: number;
}

export interface VoteRecord {
  id: number;
  monthIndex: number;
  type: ProposalType;
  title: string;
  /** The proposed command, serialized, to recognize the same proposal brought back. */
  commandKey?: string;
  passed: boolean;
  yes: number;
  no: number;
  votes: DirectorVote[];
}

export type DemandKind = 'expandTown' | 'redemptionBudget' | 'cashPatronage' | 'equityRatio' | 'growDivision' | 'fixDivision';

export interface Demand {
  id: number;
  directorId: number;
  kind: DemandKind;
  text: string;
  townId?: number;
  division?: DivisionId;
  target: number;
  createdMonth: number;
  deadlineMonth: number;
  status: 'open' | 'met' | 'missed';
}

export interface GmReview {
  monthIndex: number;
  fy: number;
  score: number;
  components: Record<string, number>;
  bonus: Cents;
  pip: boolean;
  notes: string[];
}

export interface ElectionSeat {
  districtId: number | null;
  winnerId: number;
  candidates: { memberId: number; name: string; kind: 'incumbent' | 'nominee' | 'insurgent'; platform?: PetIssue['kind']; votes: number }[];
}

export interface ElectionResult {
  year: number;
  turnout: number;
  seats: ElectionSeat[];
}

export interface MemberVote {
  id: number;
  kind: 'bylaw' | 'recall';
  title: string;
  bylaw?: BylawChange;
  directorId?: number;
  meetingMonth: number;
  supermajority: boolean;
  result?: { yesShare: number; turnout: number; passed: boolean };
}

export interface GovernanceState {
  bylaws: Bylaws;
  directors: Director[];
  boardConfidence: number;
  politicalCapital: number;
  agenda: AgendaItem[];
  nextItemId: number;
  votes: VoteRecord[];
  demands: Demand[];
  reviews: GmReview[];
  /** On a performance improvement plan after a weak review. */
  pip: boolean;
  /** GM speaks for incumbents at the next election. */
  endorse: boolean;
  elections: ElectionResult[];
  memberVotes: MemberVote[];
  lastPetitionMonth: number | null;
}

// ---------- Inbox / events ----------

export interface InboxChoice {
  options: { id: string; label: string; detail: string }[];
  defaultId: string;
  /** Month by which we must answer; the default applies after it. */
  deadline: number;
  /** Which handler applies the answer. */
  handler: string;
  data?: Record<string, number>;
  chosen?: string;
}

export interface InboxItem {
  id: number;
  monthIndex: number;
  kind: 'news' | 'history' | 'memo' | 'alert';
  title: string;
  body: string;
  read: boolean;
  eventId?: string;
  /** Decisions the GM must make (DESIGN §17.1–17.2). */
  choice?: InboxChoice;
}

export interface FiredEvent {
  id: string;
  monthIndex: number;
}

// ---------- Co-op ----------

export type Posture = 'aggressive' | 'market' | 'premium';
export type StaffLevel = 'lean' | 'standard' | 'full';
export type PayPosition = 'below' | 'at' | 'above';
/** How much upkeep a site gets (D-106). */
export type MaintenanceLevel = 'deferred' | 'routine' | 'preventive';

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
  kind: FacilityKind;
  ownership: 'owned' | 'leased';
  status: 'underConstruction' | 'operating' | 'mothballed' | 'closed';
  builtYear: number;
  acquiredMonth: number;
  condition: number;
  /** Installed component quantities in each component's unit (bu, bu/hr, count, acres). */
  components: Partial<Record<ComponentId, number>>;
  staffing: { level: StaffLevel; pay: PayPosition };
  /** Maintenance program; routine when unset (D-106). */
  maintenance?: MaintenanceLevel;
  /** Month a farm-supply site's equipment last broke down (out of service that month). */
  downMonth?: number;
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
  kind: FacilityKind;
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

export type LenderStatus = 'standard' | 'watch' | 'waiver' | 'specialCredit' | 'forcedAction';

export interface CovenantResult {
  id: 'currentRatio' | 'equityRatio' | 'termDebtToFixed' | 'debtService';
  label: string;
  value: number;
  limit: number;
  /** 'min' covenants need value ≥ limit; 'max' need value ≤ limit. */
  kind: 'min' | 'max';
  ok: boolean;
}

export interface CovenantTest {
  monthIndex: number;
  results: CovenantResult[];
  breached: boolean;
  /** Member equity at the test, to judge whether a breaching co-op is recovering. */
  equity: Cents;
}

export interface FinanceState {
  /** Covenant standing and the lender's reaction (DESIGN §12). */
  status: LenderStatus;
  /** Extra spread from the lender's risk rating (points). */
  riskSpread: number;
  breachQuarters: number;
  okQuarters: number;
  lastTest: CovenantTest | null;
  /** Co-op bank stock and allocated patronage held by lender id, by vintage year. */
  lenderEquity: Record<string, Record<number, Cents>>;
  /** Running sum of month-end debt for the lender's patronage year. */
  loanSum: Cents;
  loanMonths: number;
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
  supply: Record<SupplyDivision, SupplyBook>;
  supplyPolicy: Record<SupplyDivision, SupplyPolicy>;
  /** Fiscal-year-to-date sales to members and non-members by division (cents), for Capper-Volstead and patronage. */
  patronageStats: Record<DivisionId, { member: Cents; nonmember: Cents }>;
  equityProgram: EquityProgram;
  regional: RegionalBook;
  budget: Budget | null;
}

// ---------- Patronage, tax, equity (DESIGN §11) ----------

export type OpDivision = Exclude<DivisionId, 'CORP'>;
export const OP_DIVISIONS: OpDivision[] = ['GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'];
export type PatronageBasis = 'units' | 'sales' | 'margin';
export type LossTreatment = 'absorbUnallocated' | 'carryForward' | 'chargeAllocated' | 'netAgainstPools';

/** Shares of a pool's patronage-sourced savings (sum to 1). */
export interface PoolSplit {
  cash: number;
  qualified: number;
  nonqualified: number;
  unallocated: number;
}

export interface PatronageProposal {
  pooling: 'single' | 'byDivision';
  basis: Record<OpDivision, PatronageBasis>;
  lossTreatment: LossTreatment;
  /** 'ALL' for single pooling, else one per division. Missing pools use 'ALL'. */
  pools: Record<string, PoolSplit>;
  /** Share of the DPAD / 199A(g) deduction passed through to members (0..1). */
  passDeduction: number;
}

export type RedemptionPlan =
  | { kind: 'estate'; discountPct: number }
  | { kind: 'ageOfPatron'; age: number }
  | { kind: 'revolving' }
  | { kind: 'percentagePool' }
  | { kind: 'baseCapital' };

export interface RedemptionPolicy {
  /** Annual budget = fixed (nominal cents) + a share of last year's net savings. */
  budgetFixed: Cents;
  budgetPctOfSavings: number;
  plans: RedemptionPlan[];
}

export interface FiscalDivision {
  division: OpDivision;
  /** Operating savings after corporate overhead is allocated by gross revenue (cents). */
  operating: Cents;
  grossRevenue: Cents;
  memberShare: number;
  patronageSourced: Cents;
}

export interface FiscalResult {
  fy: number;
  closedMonth: number;
  savingsBeforeTax: Cents;
  estimatedTax: Cents;
  nonPatronage: Cents;
  divisions: FiscalDivision[];
  /** Patronage bases by "DIVISION:basis", aligned with memberIds. */
  bases: Record<string, number[]>;
  memberIds: number[];
  /** Wages paid this year (for the DPAD / 199A(g) limits) and the share of qualifying business. */
  wages: Cents;
  qualifyingShare: number;
  /** Nonqualified equity redeemed during the year (deductible this year). */
  nqRedeemed: Cents;
  status: 'audit' | 'proposal';
}

export interface RedemptionSummary {
  estate: Cents;
  age: Cents;
  revolving: Cents;
  pool: Cents;
  base: Cents;
  discount: Cents;
  nonqualified: Cents;
  total: Cents;
  budget: Cents;
}

export interface DistributionSummary {
  fy: number;
  monthIndex: number;
  savingsBeforeTax: Cents;
  patronageSourced: Cents;
  nonPatronage: Cents;
  cash: Cents;
  qualified: Cents;
  nonqualified: Cents;
  unallocated: Cents;
  /** Loss absorbed, charged against allocated equity, or carried forward. */
  loss: Cents;
  lossTreatment: LossTreatment;
  carryforwardUsed: Cents;
  tax: Cents;
  taxable: Cents;
  deduction: Cents;
  deductionPassed: Cents;
  nolUsed: Cents;
  patrons: number;
  taxOverCheck: number;
  proposal: PatronageProposal;
  restricted: boolean;
  redemption?: RedemptionSummary;
}

export interface EquityProgram {
  /** Standing patronage plan; the board votes the one in force when the proposal comes due. */
  proposal: PatronageProposal;
  redemption: RedemptionPolicy;
  pending: FiscalResult | null;
  /** Approved and awaiting payment (cash patronage, redemptions, tax). */
  approved: DistributionSummary | null;
  /** Patronage losses to recover from future patronage before allocating. */
  lossCarryforward: Cents;
  nol: { fy: number; amount: Cents; expires: number }[];
  /** Nonqualified equity redeemed this fiscal year (deductible). */
  nqRedeemedFY: Cents;
  history: DistributionSummary[];
  /** Fiscal-year-to-date business by product line, all customers. */
  fyLines: Record<string, { units: number; revenue: Cents; cogs: Cents }>;
}

// ---------- Regional co-ops (DESIGN §13) ----------

export interface RegionalBook {
  /** Calendar-year purchases by regional and category (cents; grain in bushels). */
  purchases: Record<string, Record<string, number>>;
  /** Regional equity held, by regional and vintage year. */
  equity: Record<string, Record<number, Cents>>;
  last: { year: number; patronage: Record<string, Cents>; revolved: Record<string, Cents> } | null;
}

// ---------- Budget ----------

export interface BudgetLine {
  sales: Cents;
  grossMargin: Cents;
  serviceIncome: Cents;
  opex: Cents;
  interest: Cents;
  localSavings: Cents;
}

export interface Budget {
  fy: number;
  approved: boolean;
  salesGrowthPct: number;
  costGrowthPct: number;
  capex: Cents;
  lines: Record<DivisionId, BudgetLine>;
}

export interface InventoryLayer {
  qty: number;
  /** Total cost of the layer (cents). */
  cost: Cents;
  month: number;
}

export interface ReceivablesBook {
  current: Cents;
  past30: Cents;
  past60: Cents;
  past90: Cents;
  /** Balances due at harvest (agronomy seasonal terms). */
  harvest: Cents;
}

export interface SupplyLineMonth {
  demand: number;
  sold: number;
  unmet: number;
  price: number;
  cost: number;
  revenue: Cents;
  cogs: Cents;
}

export interface SupplyMonthReport {
  monthIndex: number;
  lines: Partial<Record<LineId, SupplyLineMonth>>;
  capacity: { label: string; used: number; available: number; unit: string }[];
  margin: Breakdown;
  badDebt: Cents;
  writeDown: Cents;
  share: number;
}

export interface SupplyBook {
  inventory: Partial<Record<LineId, InventoryLayer[]>>;
  ar: ReceivablesBook;
  /** Allowance for bad debt (positive number; credit balance in 1150). */
  allowance: Cents;
  /** Customer prepayments held (positive; credit balance in 2130). */
  prepay: Cents;
  /** Propane prebuy gallons still to deliver, and their average contract price ($/gal). */
  prebuyGal: number;
  prebuyPrice: number;
  rebatesAccrued: Cents;
  /** Trailing crop-protection sales for the rebate tier (cents, this fiscal year). */
  rebateBase: Cents;
  /** Share of booked application acres done late (EMA): customers' memory of timeliness. */
  lateMemory: number;
  /** Retail share by kind and town, keyed "station:12" (0..1). */
  townShare: Record<string, number>;
  toll: { tonsPerMonth: number } | null;
  report: SupplyMonthReport | null;
  reports: SupplyMonthReport[];
}

export interface SupplyPolicy {
  posture: Posture;
  credit: 'strict' | 'normal' | 'loose';
  prepayProgram: boolean;
  /** Fertilizer fill purchases as share of next season's expected sales. */
  summerFillPct: number;
  winterFillPct: number;
  tollMilling: boolean;
  prebuyProgram: boolean;
  supplyCover: 'hand' | 'covered';
}

// ---------- Competitors ----------

export interface CompetitorSite {
  id: number;
  townId: number;
  /** Division and kind (grain elevator when omitted). */
  division?: DivisionId;
  kind?: FacilityKind;
  /** Supply sites carry their components directly. */
  components?: Partial<Record<ComponentId, number>>;
  /** Chains open in the territory in this year. */
  arrivalYear?: number;
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
  /** Simplified financial health 0–100 (D-012); set when competitor AI first runs. */
  strength?: number;
  /** A price war in progress: posture bump to remove when it ends. */
  war?: { until: number; bump: number };
  /** Last strategic move, for the competitor list. */
  lastMove?: string;
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
  boardConfidence: number;
}

// ---------- People (DESIGN §15) ----------

export interface Leader {
  id: number;
  name: string;
  female: boolean;
  birthYear: number;
  role: Role;
  /** True skills 1..20 (hidden). */
  skills: Record<Skill, number>;
  /** Ranges known to the player. */
  revealed: Record<Skill, [number, number]>;
  traits: TraitId[];
  /** Annual salary (nominal cents). */
  salary: Cents;
  loyalty: number;
  ambition: number;
  morale: number;
  burnout: number;
  hiredMonth: number;
  retireAge: number;
  bonusPlan: boolean;
  coachedMonth: number | null;
  /** Hidden flags revealed by audits or events. */
  flags: { embezzling?: boolean; hiddenPosition?: boolean; proposed?: number; approved?: number; right?: number };
  retiring?: number;
}

export interface Candidate {
  id: number;
  leader: Leader;
  source: 'search' | 'internal' | 'poach';
  competitorId?: number;
  expiresMonth: number;
  interviewed: boolean;
  referenced: boolean;
  /** One-time signing bonus (poaching). */
  signing: Cents;
  /** What the references said (after a check). */
  referenceNote?: string;
}

export interface Search {
  id: number;
  role: Role;
  band: 'at' | 'above';
  readyMonth: number;
}

export interface Incident {
  monthIndex: number;
  facilityId: number;
  serious: boolean;
  cost: Cents;
  text: string;
}

export interface LeaderNote {
  role: Role;
  leaderId: number;
  text: string;
}

export type TrainingLevel = 'minimal' | 'standard' | 'strong';

export interface WorkforceDivision {
  fte: number;
  morale: number;
  /** Annualized turnover over recent months. */
  turnover: number;
  vacancy: number;
}

export interface PeopleState {
  leaders: Leader[];
  candidates: Candidate[];
  searches: Search[];
  nextId: number;
  training: TrainingLevel;
  /** Roles the co-op needs now (recomputed monthly). */
  needed: Role[];
  workforce: Partial<Record<DivisionId, WorkforceDivision>>;
  incidents: Incident[];
  notes: LeaderNote[];
  /** Month each role last listed internal candidates. */
  internalListed: Partial<Record<Role, number>>;
}

// ---------- Deals (DESIGN §14.6) ----------

export type DealKind = 'merger' | 'divisionSale' | 'jv' | 'buyout' | 'acquisition';
export type DealStage = 'proposed' | 'study' | 'terms' | 'board' | 'members' | 'closing' | 'integration' | 'closed' | 'dead';

export interface DealPartner {
  /** Strength 0–100 (true value; shown only after diligence). */
  strength: number;
  sites: number;
  /** Fair value of the partner's plants, debt, net working capital, allocated equity (cents). */
  fairValue: Cents;
  debt: Cents;
  workingCapital: Cents;
  allocatedEquity: Cents;
  members: number;
}

export interface DealTerms {
  /** Name of the combined co-op (mergers). */
  name: string;
  /** Board seats for the partner's directors (mergers). */
  partnerSeats: number;
  /** Price (division sales, buyouts) or our offer (acquisitions) in cents. */
  price?: Cents;
  /** Share of an acquisition's price financed with a term loan. */
  financePct?: number;
}

export interface MemberVoteResult {
  yesShare: number;
  turnout: number;
  passed: boolean;
}

export interface Deal {
  id: number;
  kind: DealKind;
  /** Competitor id of the partner or buyer; null for an outside buyer. */
  partnerId: number | null;
  partnerName: string;
  division?: OpDivision;
  incoming: boolean;
  stage: DealStage;
  /** Month the current stage's work is done. */
  stageUntil: number;
  startedMonth: number;
  /** What we believe about the partner (estimates until diligence) and the truth. */
  estimate: DealPartner;
  truth: DealPartner;
  diligence: boolean;
  terms: DealTerms | null;
  ourMembers?: MemberVoteResult;
  theirMembers?: MemberVoteResult;
  log: string[];
  /** Acquisitions: the owner's asking price, set when the study is done. */
  asking?: Cents;
  /** Acquisitions: goodwill booked at closing and the month it closed (for amortization). */
  goodwill?: Cents;
  closedMonth?: number;
}

export interface JointVenture {
  id: number;
  /** An investment in a local ethanol plant rather than a combined division. */
  ethanol?: boolean;
  name: string;
  partnerName: string;
  division: OpDivision;
  sharePct: number;
  /** Book value of our investment (account 1450). */
  investment: Cents;
  /** Combined plants' replacement value at formation (cents, nominal then). */
  scale: Cents;
  formedMonth: number;
  earningsYtd: Cents;
}

// ---------- Annual reports (DESIGN §18) ----------

/** The year's results, recorded at fiscal year end; patronage is joined from the equity history. */
export interface AnnualReport {
  fy: number;
  closedMonth: number;
  coopName: string;
  sales: Cents;
  grossRevenue: Cents;
  totalOpex: Cents;
  interestNet: Cents;
  patronageIncome: Cents;
  savingsBeforeTax: Cents;
  divisions: { division: OpDivision; sales: Cents; grossRevenue: Cents; localSavings: Cents }[];
  totalAssets: Cents;
  totalEquity: Cents;
  totalDebt: Cents;
  workingCapital: Cents;
  currentRatio: number;
  ownerEquityPct: number;
  activeMembers: number;
  activeFarms: number;
  avgSatisfaction: number;
  grainBu: number;
  facilities: number;
  lenderStatus: string;
  boardConfidence: number;
  chair: string;
  directors: string[];
  highlights: string[];
  news: string[];
}

// ---------- Technology and regulation (DESIGN §17.3–17.4) ----------

export interface TechState {
  /** Adopted technologies: month completed and the sites covered (site-scoped techs). */
  adopted: Record<string, { month: number; sites: number[] }>;
  pending: { id: string; completeMonth: number; sites: number[] }[];
}

export interface RegulationState {
  /** Rules in force, by id → month they took effect. */
  active: Record<string, number>;
  /** "ruleId:facilityId" → compliant. */
  compliant: Record<string, boolean>;
  /** Sites shut for non-compliance ("ruleId:facilityId"). */
  shut: Record<string, boolean>;
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
  people: PeopleState;
  deals: Deal[];
  jvs: JointVenture[];
  /** Months of merger integration remaining (service suffers while systems combine). */
  integrationUntil: number | null;
  tech: TechState;
  regulation: RegulationState;
  /** Temporary conditions from decisions, by flag → month it ends. */
  flags: Record<string, number>;
  /** Annual reports, one per closed fiscal year. */
  reports: AnnualReport[];
  /** Recent random events that struck us. */
  eventLog: { monthIndex: number; id: string; facilityId: number; cost: Cents }[];
  competitors: Competitor[];
  inbox: InboxItem[];
  nextInboxId: number;
  firedEvents: FiredEvent[];
  history: MonthSnapshot[];
  outcome: null | { kind: 'fired' | 'liquidated' | 'absorbed'; monthIndex: number; text: string };
}
