// Random events, technology and regulation (DESIGN §17.2–17.4). Dollar amounts are 2024 $.

import { s, type Confidence } from './types';

// ---------------- Random events ----------------

export type RandomEventId = 'dustExplosion' | 'outOfCondition' | 'fuelFire' | 'nh3Theft' | 'stormDamage' | 'chemicalDrift' | 'lawsuit' | 'truckRollover' | 'cyberattack';

export interface RandomEventDef {
  id: RandomEventId;
  label: string;
  from: number;
  to?: number;
  /** Base monthly probability per qualifying site (or for the co-op). */
  baseMonthly: number;
  /** Cost (2024 $): direct loss before insurance. */
  cost: number;
  /** Share of the cost insurance pays. */
  insured: number;
  confidence: Confidence;
  note?: string;
}

export const RANDOM_EVENTS: Record<RandomEventId, RandomEventDef> = {
  dustExplosion: { id: 'dustExplosion', label: 'Grain dust explosion', from: 1970, baseMonthly: 0.00006, cost: 2_500_000, insured: 0.7, confidence: 'low', note: 'Per elevator, scaled by storage and season; doubled before the 1987 OSHA grain standard. US: ~10–20 explosions a year among ~10,000 elevators in the 1970s–80s, about half that later (D-086)' },
  outOfCondition: { id: 'outOfCondition', label: 'Out-of-condition grain', from: 1970, baseMonthly: 0.02, cost: 0, insured: 0, confidence: 'low', note: 'Per elevator in Dec–Apr after a wet fall; loss as a share of corn inventory' },
  fuelFire: { id: 'fuelFire', label: 'Bulk plant fire', from: 1970, baseMonthly: 0.0004, cost: 400_000, insured: 0.8, confidence: 'low' },
  nh3Theft: { id: 'nh3Theft', label: 'Anhydrous ammonia theft', from: 1995, to: 2012, baseMonthly: 0.01, cost: 8_000, insured: 0, confidence: 'low', note: 'Meth-lab era thefts from nurse tanks' },
  stormDamage: { id: 'stormDamage', label: 'Storm damage', from: 1970, baseMonthly: 0.002, cost: 300_000, insured: 0.85, confidence: 'low', note: 'Tornado, straight-line wind, derecho' },
  chemicalDrift: { id: 'chemicalDrift', label: 'Chemical drift complaint', from: 1975, baseMonthly: 0.003, cost: 40_000, insured: 0.5, confidence: 'low', note: 'Per agronomy site, April–July' },
  lawsuit: { id: 'lawsuit', label: 'Lawsuit', from: 1970, baseMonthly: 0.004, cost: 150_000, insured: 0.6, confidence: 'low', note: 'Customer injury or contract dispute, co-op wide' },
  truckRollover: { id: 'truckRollover', label: 'Delivery truck rollover', from: 1970, baseMonthly: 0.002, cost: 120_000, insured: 0.75, confidence: 'low', note: 'Per energy site' },
  cyberattack: { id: 'cyberattack', label: 'Ransomware attack', from: 2015, baseMonthly: 0.004, cost: 250_000, insured: 0.3, confidence: 'low' },
};

export const EVENT_PARAMS = {
  /** Explosion risk multiplier per million bushels received in the month. */
  dustPerMillionBu: s(1.5, 'low'),
  /** Explosion risk before the OSHA grain handling standard took hold. */
  preStandardFactor: 2,
  standardYear: 1988,
  /** Out-of-condition loss as a share of corn on hand. */
  outOfConditionLoss: [0.01, 0.04] as [number, number],
  /** Explosions and fires: condition lost and weeks down. */
  explosionCondition: 45,
  explosionDownWeeks: 16,
  fireCondition: 30,
  stormCondition: 15,
  /** Board confidence and town satisfaction after a deadly explosion. */
  explosionConfidence: -12,
  explosionSatisfaction: -6,
  /** Months to answer an event that asks for a decision. */
  decisionMonths: 2,
  /** A lawsuit fought in court: chance of winning, and cost multiple if we lose. */
  lawsuitWinProb: s(0.55, 'low'),
  lawsuitLoseMultiple: s(2.5, 'low'),
};

// ---------------- Technology ----------------

export type TechEffectKey = 'delivery' | 'application' | 'shrink' | 'officeCost' | 'basis' | 'satisfaction' | 'grainLabor' | 'dustRisk' | 'conditionLoss' | 'cyberRisk' | 'incidents' | 'supplyShare';

export interface TechDef {
  id: string;
  name: string;
  firstYear: number;
  /** Cost (2024 $) per qualifying site, or for the co-op if `kinds` is omitted. */
  cost: number;
  /** Facility kinds it is installed at (omitted = co-op wide). */
  kinds?: ('elevator' | 'agronomy' | 'feedmill' | 'energy' | 'station' | 'farmstore')[];
  adoptionMonths: number;
  /** Multipliers (×) or additions (+) by key; see TECH_ADDITIVE. */
  effects: Partial<Record<TechEffectKey, number>>;
  description: string;
  confidence: Confidence;
}

/** Effects that add rather than multiply. */
export const TECH_ADDITIVE: TechEffectKey[] = ['basis', 'satisfaction', 'supplyShare'];

export const TECHNOLOGIES: TechDef[] = [
  { id: 'two-way-radio', name: 'Two-way radios in trucks', firstYear: 1970, cost: 15_000, adoptionMonths: 2, effects: { delivery: 1.05, application: 1.03 }, description: 'Dispatch reaches drivers and applicators in the field.', confidence: 'low' },
  { id: 'electronic-scales', name: 'Electronic truck scales', firstYear: 1975, cost: 40_000, kinds: ['elevator'], adoptionMonths: 3, effects: { shrink: 0.9, grainLabor: 0.95 }, description: 'Fewer weighing errors and faster dumping.', confidence: 'low' },
  { id: 'computer-accounting', name: 'Computerized accounting', firstYear: 1980, cost: 60_000, adoptionMonths: 6, effects: { officeCost: 0.9 }, description: 'Patronage records, billing and receivables on a minicomputer.', confidence: 'low' },
  { id: 'dtn', name: 'Satellite market data (DTN)', firstYear: 1984, cost: 20_000, adoptionMonths: 1, effects: { basis: 0.003 }, description: 'Real-time futures and basis at every scale house.', confidence: 'low' },
  { id: 'dust-control', name: 'Dust control & housekeeping systems', firstYear: 1980, cost: 120_000, kinds: ['elevator'], adoptionMonths: 4, effects: { dustRisk: 0.4, incidents: 0.9 }, description: 'Aspiration, oil suppression and bearing monitors.', confidence: 'low' },
  { id: 'gps-vrt', name: 'GPS and variable-rate application', firstYear: 1997, cost: 250_000, kinds: ['agronomy'], adoptionMonths: 6, effects: { application: 1.15, supplyShare: 0.1 }, description: 'Prescription maps; floaters apply what each acre needs.', confidence: 'low' },
  { id: 'bin-cables', name: 'Grain bin temperature cables', firstYear: 2000, cost: 60_000, kinds: ['elevator'], adoptionMonths: 3, effects: { conditionLoss: 0.4 }, description: 'Hot spots found before grain goes out of condition.', confidence: 'low' },
  { id: 'tank-monitors', name: 'Remote tank monitors', firstYear: 2006, cost: 150_000, kinds: ['energy'], adoptionMonths: 6, effects: { delivery: 1.15 }, description: 'Deliver when tanks need it, not on a route schedule.', confidence: 'low' },
  { id: 'auto-steer', name: 'Auto-steer floaters & sprayers', firstYear: 2008, cost: 200_000, kinds: ['agronomy'], adoptionMonths: 6, effects: { application: 1.1, incidents: 0.9 }, description: 'Longer days with less operator fatigue.', confidence: 'low' },
  { id: 'online-portal', name: 'Online customer portal', firstYear: 2012, cost: 100_000, adoptionMonths: 9, effects: { satisfaction: 0.1 }, description: 'Statements, contracts and bids on the phone.', confidence: 'low' },
  { id: 'cybersecurity', name: 'Cybersecurity program', firstYear: 2016, cost: 80_000, adoptionMonths: 6, effects: { cyberRisk: 0.3 }, description: 'Backups, training and monitoring.', confidence: 'low' },
  { id: 'drones', name: 'Drone scouting', firstYear: 2017, cost: 50_000, kinds: ['agronomy'], adoptionMonths: 3, effects: { supplyShare: 0.05 }, description: 'Agronomists see problems early.', confidence: 'low' },
  { id: 'ai-tools', name: 'AI tools for merchandising and the office', firstYear: 2023, cost: 120_000, adoptionMonths: 9, effects: { basis: 0.003, officeCost: 0.95 }, description: 'Forecasting, document work and customer service.', confidence: 'low' },
];

// ---------------- Regulation ----------------

export interface RegulationDef {
  id: string;
  label: string;
  /** Switched on by a historical event (its id) or from a year. */
  eventId?: string;
  fromYear?: number;
  kinds: ('elevator' | 'agronomy' | 'feedmill' | 'energy' | 'station' | 'farmstore')[];
  /** Only sites with this component (e.g. NH3 storage). */
  component?: string;
  /** One-time compliance project per site (2024 $), and months allowed. */
  compliancePerSite: number;
  deadlineMonths: number;
  /** Absolute deadline (year, month) overrides deadlineMonths. */
  deadline?: [number, number];
  /** Fine per non-compliant site per month after the deadline (2024 $). */
  finePerMonth: number;
  /** Months after the deadline before a non-compliant site is shut. */
  closeAfterMonths?: number;
  /** Ongoing cost per site per month (2024 $). */
  opexPerMonth: number;
  description: string;
  confidence: Confidence;
}

export const REGULATIONS: RegulationDef[] = [
  { id: 'osha-grain', label: 'OSHA grain handling standard', fromYear: 1988, kinds: ['elevator'], compliancePerSite: 75_000, deadlineMonths: 24, finePerMonth: 5_000, opexPerMonth: 300, description: 'Housekeeping, bin-entry permits and training (29 CFR 1910.272, 1987). Non-compliant elevators run twice the dust-explosion risk.', confidence: 'medium' },
  { id: 'ust', label: 'Underground storage tank rules', eventId: 'ust-rules-1988', kinds: ['energy', 'station'], compliancePerSite: 90_000, deadlineMonths: 0, deadline: [1998, 12], finePerMonth: 10_000, closeAfterMonths: 12, opexPerMonth: 150, description: 'Leak detection, corrosion protection and spill/overfill prevention for every tank by December 1998, or close it.', confidence: 'high' },
  { id: 'cdl', label: 'Commercial driver licensing', fromYear: 1992, kinds: ['energy'], compliancePerSite: 0, deadlineMonths: 0, finePerMonth: 0, opexPerMonth: 400, description: 'CDLs, drug testing and hazmat endorsements for delivery drivers.', confidence: 'medium' },
  { id: 'rmp-nh3', label: 'Risk management plans for anhydrous ammonia', fromYear: 1999, kinds: ['agronomy'], component: 'nh3-storage', compliancePerSite: 40_000, deadlineMonths: 12, finePerMonth: 8_000, opexPerMonth: 200, description: 'EPA risk management plan, hazard review and emergency response for NH3 storage.', confidence: 'medium' },
  { id: 'ulsd', label: 'Ultra-low-sulfur diesel', eventId: 'ulsd-2006', kinds: ['energy', 'station'], compliancePerSite: 30_000, deadlineMonths: 6, finePerMonth: 5_000, opexPerMonth: 0, description: 'Clean tanks and segregate product for 15 ppm diesel.', confidence: 'medium' },
  { id: 'nutrient', label: 'Nutrient management rules', eventId: 'lake-erie-2014', kinds: ['agronomy'], compliancePerSite: 25_000, deadlineMonths: 18, finePerMonth: 3_000, opexPerMonth: 500, description: 'Applicator certification and restrictions on winter manure and fertilizer application (Lake Erie watershed).', confidence: 'medium' },
  { id: 'vfd', label: 'Veterinary feed directive', fromYear: 2017, kinds: ['feedmill'], compliancePerSite: 15_000, deadlineMonths: 6, finePerMonth: 2_000, opexPerMonth: 200, description: 'Veterinary orders for medicated feed; records and labeling.', confidence: 'medium' },
  { id: 'eld', label: 'Electronic logging devices', eventId: 'eld-2017', kinds: ['energy', 'feedmill'], compliancePerSite: 10_000, deadlineMonths: 12, finePerMonth: 2_000, opexPerMonth: 100, description: 'Hours-of-service logging on delivery trucks.', confidence: 'medium' },
];

// ---------------- Choices on historical events ----------------

export interface ChoiceOption {
  id: string;
  label: string;
  detail: string;
}

export interface HistoryChoice {
  eventId: string;
  title: string;
  question: string;
  options: ChoiceOption[];
  defaultId: string;
}

export const HISTORY_CHOICES: HistoryChoice[] = [
  {
    eventId: 'oil-embargo-1973', title: 'Decision: fuel supply during the embargo', question: 'Fuel is being allocated. How do we keep our energy customers supplied?', defaultId: 'spot',
    options: [
      { id: 'program', label: 'Join our regional\'s allocation program', detail: 'A fee of about $20,000 (2024 $) buys priority supply: propane and diesel allocation eases while shortages last.' },
      { id: 'spot', label: 'Buy what we can on the spot market', detail: 'No fee; we live with the federal allocation like everyone else.' },
    ],
  },
  {
    eventId: 'farm-crisis-1984', title: 'Decision: credit policy in the farm crisis', question: 'Members are falling behind on their accounts. What is our policy?', defaultId: 'tighten',
    options: [
      { id: 'restructure', label: 'Restructure members\' debts', detail: 'Turn past-due accounts into notes. Bad debt is spread out, members are grateful, but cash is tied up.' },
      { id: 'tighten', label: 'Tighten credit and collect', detail: 'Protects the balance sheet; members in trouble will remember.' },
    ],
  },
  {
    eventId: 'ethanol-boom-2006', title: 'Decision: invest in a local ethanol plant?', question: 'Local investors are raising money for an ethanol plant and want the co-op in.', defaultId: 'decline',
    options: [
      { id: 'invest', label: 'Invest $1 million (2024 $) for a minority stake', detail: 'Returns follow the ethanol margin: rich in the boom, poor in the 2012 drought and 2020.' },
      { id: 'decline', label: 'Stay out', detail: 'Keep our capital for our own plants.' },
    ],
  },
];

/** Choice effects (2024 $ and multipliers). */
export const CHOICE_EFFECTS = {
  /** Fee for the regional's fuel allocation program, and how much of the shortfall it restores. */
  fuelProgramFee: s(20_000, 'low'),
  fuelProgramRelief: s(0.6, 'low'),
  fuelProgramMonths: 30,
  /** Farm crisis credit policy, for this many months. */
  creditPolicyMonths: 48,
  /** Restructuring: write-offs slower, past-due collections slower, members grateful. */
  restructureWriteOff: s(0.5, 'low'),
  restructureCollect: s(0.6, 'low'),
  restructureSatisfaction: s(5, 'low'),
  /** Tightening: less exposure to farm stress, members resentful. */
  tightenStress: s(0.6, 'low'),
  tightenSatisfaction: s(-6, 'low'),
  ethanolStake: s(1_000_000, 'low'),
  ethanolSharePct: s(0.08, 'low'),
};

// Ethanol returns by year now live with the other investments (D-112, src/data/investments.ts).
