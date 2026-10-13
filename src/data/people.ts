// People (DESIGN §15): leadership roles, skills and their effects, traits, hiring, the
// labor market, staffing, training and safety. Dollar amounts are 2024 dollars.

import { annual, s } from './types';

export type Role = 'CFO' | 'COO' | 'GRAIN' | 'AGRONOMY' | 'FEED' | 'ENERGY' | 'RETAIL' | 'SAFETY' | 'HR' | 'MARKETING' | 'IT';
export const ROLES: Role[] = ['CFO', 'COO', 'GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL', 'SAFETY', 'HR', 'MARKETING', 'IT'];

export type Skill = 'leadership' | 'operations' | 'sales' | 'merchandising' | 'finance' | 'safety' | 'memberRelations' | 'innovation';
export const SKILLS: Skill[] = ['leadership', 'operations', 'sales', 'merchandising', 'finance', 'safety', 'memberRelations', 'innovation'];
export const SKILL_LABEL: Record<Skill, string> = {
  leadership: 'Leadership', operations: 'Operations', sales: 'Sales', merchandising: 'Merchandising', finance: 'Finance', safety: 'Safety',
  memberRelations: 'Member relations', innovation: 'Innovation',
};

export interface RoleDef {
  label: string;
  /** Annual salary at market (2024 $). */
  salary: number;
  /** Skills that matter most (candidates are drawn strong in these). */
  primary: Skill[];
  /**
   * When the position exists. Thresholds are on gross revenue (margins plus service income,
   * trailing year, 2024 $) so a role appears when the business can carry its salary.
   * Before that, a location manager or bookkeeper handles it at `baseSkill`.
   */
  unlock: { minOperatingSites?: number; divisionSites?: number; minGross2024?: number; divisionGross2024?: number; minFte?: number; fromYear?: number; minMembers?: number };
}

export const ROLE_DEFS: Record<Role, RoleDef> = {
  CFO: { label: 'Chief financial officer', salary: 120_000, primary: ['finance', 'leadership'], unlock: { minGross2024: 5_000_000 } },
  COO: { label: 'Chief operating officer', salary: 140_000, primary: ['operations', 'leadership'], unlock: { minOperatingSites: 6, minGross2024: 8_000_000 } },
  GRAIN: { label: 'Grain division manager', salary: 100_000, primary: ['merchandising', 'operations'], unlock: { divisionSites: 2, divisionGross2024: 3_000_000 } },
  AGRONOMY: { label: 'Agronomy division manager', salary: 95_000, primary: ['sales', 'operations'], unlock: { divisionSites: 2, divisionGross2024: 3_000_000 } },
  FEED: { label: 'Feed division manager', salary: 90_000, primary: ['sales', 'operations'], unlock: { divisionSites: 2, divisionGross2024: 2_500_000 } },
  ENERGY: { label: 'Energy division manager', salary: 90_000, primary: ['sales', 'operations'], unlock: { divisionSites: 2, divisionGross2024: 2_500_000 } },
  RETAIL: { label: 'Retail manager', salary: 80_000, primary: ['sales', 'leadership'], unlock: { divisionSites: 3, divisionGross2024: 2_000_000 } },
  SAFETY: { label: 'Safety director', salary: 85_000, primary: ['safety', 'operations'], unlock: { minOperatingSites: 4, minGross2024: 6_000_000, fromYear: 1975 } },
  HR: { label: 'Human resources manager', salary: 80_000, primary: ['leadership', 'memberRelations'], unlock: { minFte: 60 } },
  MARKETING: { label: 'Marketing & member relations manager', salary: 85_000, primary: ['memberRelations', 'sales'], unlock: { minMembers: 1000, minGross2024: 8_000_000 } },
  IT: { label: 'Information technology manager', salary: 95_000, primary: ['innovation', 'operations'], unlock: { minFte: 60, fromYear: 1990 } },
};

export const PEOPLE = {
  /** Effective skill when the work is done by a location manager or bookkeeper (role not yet needed). */
  baseSkill: s(10, 'low', 'Neutral: no effect until the co-op is big enough to need the role'),
  /** Effective skill when a needed role is vacant and the GM covers it. */
  vacantSkill: s(6, 'low'),
  /** Political capital lost per month per vacant role (the GM's time). */
  vacancyCapitalDrain: s(0.5, 'low'),
  /** Benefits and payroll tax on leader salaries. */
  benefitsRate: s(0.28, 'low'),
  retireAgeRange: [62, 68] as [number, number],
  /** Notice before retirement (months). */
  retireNotice: 6,
  /** Skill range shown for an unknown candidate: ± this much around the truth, before interviews. */
  revealWidth: { none: 5, interview: 3, references: 1.5 },
  /** Ranges narrow by this much per year on the job. */
  revealPerYear: 1,
  /** Severance in months of salary. */
  severanceMonths: 3,
  raisePct: 0.05,
  /** Bonus plan: share of salary paid at year end when the division beats budget. */
  bonusPct: s(0.1, 'low'),
};

/** GM time (political capital) spent on people work. */
export const POLITICAL_CAPITAL_COSTS = { interview: 1, coach: 2 };

export const SEARCH = {
  /** Retained search fee as a share of first-year salary. */
  feePct: s(0.2, 'low'),
  months: [2, 4] as [number, number],
  candidates: 3,
  /** Mean skill in the primary skills of searched candidates, before adjustments. */
  meanSkill: s(10.5, 'low'),
  sd: s(2.5, 'low'),
  /** Pay band adds to candidate quality and asking pay. */
  payBand: { at: { quality: 0, pay: 1 }, above: { quality: 1.5, pay: 1.15 } },
  /** Internal candidates: location staff grown into the job. */
  internalMeanSkill: s(9, 'low'),
  internalPay: 0.85,
  /** Poaching: a strong manager from a competitor, at a premium and a signing bonus. */
  poachSkillBonus: s(2.5, 'low'),
  poachPay: 1.3,
  poachSigningPct: 0.25,
  /** Competitor's bid posture bump (2024 $/bu) after we poach their people, for a year. */
  poachRetaliation: s(0.02, 'low'),
  candidateValidMonths: 3,
  /** Reference check cost (2024 $). */
  referenceCost: 2_500,
};

export type TraitId = 'disciplinedHedger' | 'gunslinger' | 'oldSchool' | 'rainmaker' | 'tightWithADollar' | 'builder' | 'coasting' | 'peoplePerson';

export interface TraitDef {
  label: string;
  description: string;
  /** Skill adjustments while in the job. */
  skills?: Partial<Record<Skill, number>>;
  /** Chance a generated leader has the trait (roles listed, or any). */
  prob: number;
  roles?: Role[];
}

export const TRAITS: Record<TraitId, TraitDef> = {
  disciplinedHedger: { label: 'Disciplined Hedger', description: 'Hedges exactly to policy and never runs over position limits. Slippage halved.', prob: 0.25, roles: ['GRAIN', 'CFO'] },
  gunslinger: { label: 'Gunslinger', description: 'Sharp merchandiser (+2) who likes to hold a view: hedges less than policy and may hide a speculative position.', skills: { merchandising: 2 }, prob: 0.15, roles: ['GRAIN'] },
  oldSchool: { label: 'Old School', description: 'Farmers trust him or her; new technology waits. Member relations +2, innovation −3.', skills: { memberRelations: 2, innovation: -3 }, prob: 0.2 },
  rainmaker: { label: 'Rainmaker', description: 'Sells. Sales +3.', skills: { sales: 3 }, prob: 0.15, roles: ['AGRONOMY', 'FEED', 'ENERGY', 'RETAIL', 'MARKETING'] },
  tightWithADollar: { label: 'Tight With a Dollar', description: 'Cuts costs (division opex −3%) but staff morale suffers.', prob: 0.15 },
  builder: { label: 'Builder', description: 'Brings projects in on budget (overruns −) and keeps pushing for new ones.', prob: 0.15, roles: ['COO', 'GRAIN', 'AGRONOMY', 'FEED', 'ENERGY'] },
  coasting: { label: 'Coasting to Retirement', description: 'Effects −20%, and retiring soon.', prob: 0.1 },
  peoplePerson: { label: 'People Person', description: 'Staff stay. Turnover in the division −25%, morale +.', prob: 0.15 },
};

export type EffectKey =
  | 'grain.basis' | 'grain.throughput' | 'supply.share' | 'agronomy.application' | 'feed.mill' | 'energy.delivery' | 'finance.spread'
  | 'finance.forecast' | 'coo.opex' | 'coo.decay' | 'safety.incidents' | 'safety.insurance' | 'hr.turnover' | 'members.satisfaction'
  | 'members.election' | 'innovation.adoption' | 'staff.morale';

export interface EffectRow {
  role: Role | 'division';
  skill: Skill;
  key: EffectKey;
  /** Effect per skill point away from 10 (neutral). */
  perPoint: number;
  /** Bounds on the effect. */
  min: number;
  max: number;
  unit: string;
  description: string;
}

/** The skill → effect table (DESIGN §15.2), shown in the People screen. */
export const EFFECTS: EffectRow[] = [
  { role: 'GRAIN', skill: 'merchandising', key: 'grain.basis', perPoint: 0.004, min: -0.03, max: 0.04, unit: '$/bu (2024)', description: 'Basis captured on grain sold' },
  { role: 'GRAIN', skill: 'operations', key: 'grain.throughput', perPoint: 0.012, min: -0.1, max: 0.12, unit: '× receiving rate', description: 'Bushels per hour through the legs at harvest' },
  { role: 'division', skill: 'sales', key: 'supply.share', perPoint: 0.03, min: -0.25, max: 0.3, unit: 'utility', description: 'Farmers\' preference for our farm-supply divisions' },
  { role: 'AGRONOMY', skill: 'operations', key: 'agronomy.application', perPoint: 0.015, min: -0.12, max: 0.15, unit: '× acres/day', description: 'Custom application acres per rig-day' },
  { role: 'FEED', skill: 'operations', key: 'feed.mill', perPoint: 0.012, min: -0.1, max: 0.12, unit: '× mill tons', description: 'Feed mill throughput' },
  { role: 'ENERGY', skill: 'operations', key: 'energy.delivery', perPoint: 0.012, min: -0.1, max: 0.12, unit: '× gallons/truck', description: 'Delivery truck gallons per month' },
  { role: 'CFO', skill: 'finance', key: 'finance.spread', perPoint: -0.04, min: -0.3, max: 0.25, unit: 'points', description: 'Lender\'s spread on our line and new term loans' },
  { role: 'CFO', skill: 'finance', key: 'finance.forecast', perPoint: -0.08, min: -0.8, max: 0.6, unit: '× forecast error', description: 'Error in budgets and the CFO\'s notes' },
  { role: 'COO', skill: 'operations', key: 'coo.opex', perPoint: -0.004, min: -0.04, max: 0.03, unit: '× site operating cost', description: 'Wages, repairs and utilities at every site' },
  { role: 'COO', skill: 'operations', key: 'coo.decay', perPoint: -0.03, min: -0.25, max: 0.2, unit: '× condition decay', description: 'How fast facilities wear' },
  { role: 'SAFETY', skill: 'safety', key: 'safety.incidents', perPoint: -0.07, min: -0.5, max: 0.4, unit: '× incident risk', description: 'Workplace injuries and accidents' },
  { role: 'SAFETY', skill: 'safety', key: 'safety.insurance', perPoint: -0.01, min: -0.08, max: 0.06, unit: '× insurance', description: 'Property and liability premiums' },
  { role: 'HR', skill: 'leadership', key: 'hr.turnover', perPoint: -0.05, min: -0.35, max: 0.3, unit: '× turnover', description: 'Employee turnover; quality of hires' },
  { role: 'MARKETING', skill: 'memberRelations', key: 'members.satisfaction', perPoint: 0.04, min: -0.3, max: 0.3, unit: 'points/month', description: 'Member satisfaction drift' },
  { role: 'MARKETING', skill: 'memberRelations', key: 'members.election', perPoint: 0.03, min: -0.2, max: 0.25, unit: 'utility', description: 'Incumbents\' standing in elections; accuracy of vote forecasts' },
  { role: 'IT', skill: 'innovation', key: 'innovation.adoption', perPoint: -0.05, min: -0.4, max: 0.3, unit: '× months', description: 'Time to adopt new technology (M7)' },
  { role: 'division', skill: 'leadership', key: 'staff.morale', perPoint: 1.2, min: -10, max: 10, unit: 'morale points', description: 'Staff morale in the division' },
];

/** Labor market tightness by year (1 = normal). Tight markets raise wages, vacancies and turnover. */
export const LABOR_MARKET = annual(1970, [
  1.0, 0.95, 1.0, 1.05, 1.0, 0.85, 0.9, 0.95, 1.0, 1.0, // 1970s
  0.9, 0.85, 0.75, 0.75, 0.85, 0.85, 0.9, 0.95, 1.0, 1.05, // 1980s
  1.0, 0.95, 0.95, 1.0, 1.05, 1.1, 1.1, 1.2, 1.25, 1.3, // 1990s
  1.3, 1.1, 1.0, 1.0, 1.05, 1.1, 1.15, 1.1, 1.0, 0.8, // 2000s
  0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.25, 1.25, // 2010s
  0.95, 1.3, 1.35, 1.25, 1.2, 1.15, // 2020s
], 'low', 'Shaped on the U.S. unemployment rate (inverse)');

export const STAFFING = {
  /** Annual turnover at normal tightness, standard staffing, market pay. */
  baseTurnover: s(0.18, 'low'),
  turnoverByLevel: { lean: 1.3, standard: 1, full: 0.85 } as Record<string, number>,
  turnoverByPay: { below: 1.4, at: 1, above: 0.7 } as Record<string, number>,
  /** Hiring and training cost per departure (2024 $). */
  replacementCost: s(3_000, 'low', 'Uninsured hiring and training cost per departure'),
  /** Wage premium per point of labor tightness above 1. */
  wageTightness: s(0.25, 'low'),
  /** Share of positions unfilled per point of tightness above 1 at market pay. */
  vacancyTightness: s(0.15, 'low'),
  /** Service lost per point of annual turnover (inexperienced crews). */
  turnoverService: s(0.3, 'low'),
};

export const TRAINING = {
  /** Training & safety spending per FTE per year (2024 $). */
  budget: { minimal: 150, standard: 600, strong: 1_500 } as Record<string, number>,
  incidents: { minimal: 1.4, standard: 1, strong: 0.7 } as Record<string, number>,
  morale: { minimal: -5, standard: 0, strong: 4 } as Record<string, number>,
  /** Monthly skill growth chance for leaders. */
  growth: { minimal: 0.01, standard: 0.02, strong: 0.035 } as Record<string, number>,
};

export const INCIDENTS = {
  /** Recordable injuries per FTE per year (ag retail and grain handling, 1990s level). */
  ratePerFte: [
    { year: 1970, value: 0.08, confidence: 'low' },
    { year: 1990, value: 0.055, confidence: 'low' },
    { year: 2010, value: 0.035, confidence: 'low' },
    { year: 2024, value: 0.025, confidence: 'low' },
  ] as { year: number; value: number; confidence: 'low' }[],
  levelFactor: { lean: 1.35, standard: 1, full: 0.85 } as Record<string, number>,
  harvestFactor: s(1.6, 'low'),
  /** Cost of an ordinary recordable injury (2024 $): claims, lost time, fines. */
  cost: s(12_000, 'low', 'Uninsured cost: deductibles, lost time, fines'),
  /** Share of incidents that are serious (hospitalization, entrapment, amputation). */
  seriousShare: s(0.06, 'low'),
  seriousCost: s(250_000, 'low', 'OSHA penalties, claims, legal costs, downtime'),
  seriousConfidence: s(-8, 'low'),
  seriousSatisfaction: s(-5, 'low'),
};

export const NOTES = {
  /** Noise in a leader's forecast at skill 1 (falls linearly to ~0 at 20). */
  noiseAtSkill1: s(1, 'low'),
};

export const MISCONDUCT = {
  /** Chance a hire carries a hidden misconduct risk (embezzlement), lower with reference checks. */
  embezzleProb: s(0.03, 'low'),
  /** Monthly theft as share of salary while undetected. */
  embezzleMonthly: s(0.15, 'low'),
  /** Monthly detection chance (raised by the CFO's finance skill and the annual audit). */
  detectMonthly: s(0.03, 'low'),
  auditDetect: s(0.35, 'low'),
  /** Gunslinger hidden position: share of policy-hedged bushels left open. */
  hiddenPositionShare: s(0.3, 'low'),
  hiddenPositionProb: s(0.25, 'low', 'Chance per year a Gunslinger opens a hidden position'),
  scandalConfidence: s(-10, 'low'),
};
