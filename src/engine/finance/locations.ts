// Location analysis (D-121): each site's results over a period, the way a co-op controller builds
// a location P&L. Costs a site incurs (its crew, depreciation, repairs, insurance, utilities,
// property tax, compliance, incidents) come straight from ledger lines tagged with the site.
// What the division earns and spends as a whole — gross margin, selling and delivery costs,
// bad debt, managers and salespeople — is spread over its sites by the volume each handled:
// bushels received for grain, sales won for farm supply. Corporate overhead and interest can be
// spread on top by gross revenue. Derived from the books each time; nothing is stored.

import { COMPONENTS, type ComponentId } from '../../data/facilities';
import { DIVISION_LABEL, SUPPLY_DIVISIONS } from '../../data/supply';
import { bd, type Breakdown } from '../core/breakdown';
import type { Cents } from '../core/money';
import { yearOf } from '../core/calendar';
import { formatCents } from '../core/format';
import { grainCapacity, netBookValue } from '../facilities/facilities';
import { ACCOUNT_BY_ID } from '../ledger/coa';
import { incomeStatement, type IncomeStatement } from '../ledger/statements';
import type { DivisionId, Facility, GameState } from '../types';

type OpexGroup = 'personnel' | 'depreciation' | 'repairs' | 'insurance' | 'utilities' | 'badDebt' | 'otherOpex';
const GROUPS: OpexGroup[] = ['personnel', 'depreciation', 'repairs', 'insurance', 'utilities', 'badDebt', 'otherOpex'];
const GROUP_LABEL: Record<OpexGroup, string> = {
  personnel: 'Crew wages and benefits', depreciation: 'Depreciation', repairs: 'Repairs and maintenance', insurance: 'Insurance',
  utilities: 'Utilities', badDebt: 'Bad debt', otherOpex: 'Property tax, compliance and other',
};

export interface LocationResult {
  facilityId: number;
  name: string;
  townId: number;
  division: DivisionId;
  status: Facility['status'];
  /** Volume handled in the period and its unit, and this site's share of the division's volume. */
  volume: number;
  volumeUnit: string;
  volumeShare: number;
  /** Sales and service income credited to the site (allocated by volume). */
  revenue: Cents;
  /** Gross margin plus service income (allocated by volume). */
  grossRevenue: Cents;
  /** Costs booked to the site itself. */
  direct: Record<OpexGroup, Cents>;
  directTotal: Cents;
  /** Its share of the division's costs that are not booked to any one site. */
  divisionCosts: Cents;
  /** Gross revenue less direct and division costs: what the site earns before corporate overhead. */
  contribution: Cents;
  /** Its share of corporate overhead and interest (by gross revenue). */
  overhead: Cents;
  net: Cents;
  bookValue: Cents;
  /** Contribution over net book value, annualized. */
  returnOnAssets: number;
  condition: number;
  ageYears: number;
  staffing: string;
  maintenance: string;
  /** Storage (grain, bu) or main capacity, for context. */
  capacity: string;
  why: Breakdown;
}

export interface LocationAnalysis {
  from: number;
  to: number;
  months: number;
  sites: LocationResult[];
  /** True when some site volumes are estimated from capacity (older saves, no history yet). */
  estimated: boolean;
  /** Division results with no site to carry them (a division sold or closed during the period). */
  unallocated: Cents;
}

function capacityLabel(f: Facility): string {
  if (f.kind === 'elevator') return `${Math.round(grainCapacity(f.components).storageBu / 1000).toLocaleString('en-US')}k bu storage`;
  const main = (Object.keys(f.components) as ComponentId[]).filter((id) => id !== 'site' && COMPONENTS[id].unit !== 'each').sort()[0];
  return main ? `${(f.components[main] ?? 0).toLocaleString('en-US')} ${COMPONENTS[main].unit} ${COMPONENTS[main].label.toLowerCase()}` : '';
}

/** Results by site over the trailing `months` (to the current month). */
export function locationAnalysis(state: GameState, months = 12): LocationAnalysis {
  const to = state.clock.monthIndex;
  const from = Math.max(state.ledger.firstMonth, to - months + 1);
  const n = to - from + 1;
  // Tagged ledger activity by site and account.
  const tagged = new Map<number, Record<string, Cents>>();
  for (const m of state.ledger.months) {
    if (m.monthIndex < from || m.monthIndex > to || !m.byFacility) continue;
    for (const [k, v] of Object.entries(m.byFacility)) {
      const [acc, fid] = k.split('|');
      const o = tagged.get(Number(fid)) ?? {};
      o[acc] = (o[acc] ?? 0) + v;
      tagged.set(Number(fid), o);
    }
  }
  const groupOf = (acc: string): OpexGroup | null => {
    const g = ACCOUNT_BY_ID[acc]?.isGroup;
    return g && (GROUPS as string[]).includes(g) ? (g as OpexGroup) : null;
  };
  // Volumes by site from the monthly reports.
  const volume = new Map<number, number>();
  for (const r of state.coop.grain.reports) if (r.monthIndex >= from && r.monthIndex <= to) for (const [fid, v] of Object.entries(r.byFacility ?? {})) volume.set(Number(fid), (volume.get(Number(fid)) ?? 0) + v);
  for (const d of SUPPLY_DIVISIONS) for (const r of state.coop.supply[d].reports) if (r.monthIndex >= from && r.monthIndex <= to) for (const [fid, v] of Object.entries(r.bySite ?? {})) volume.set(Number(fid), (volume.get(Number(fid)) ?? 0) + v);

  const sites = state.coop.facilities.filter((f) => f.status !== 'closed' || tagged.has(f.id)).sort((a, b) => a.id - b.id);
  const divisions = [...new Set(sites.map((f) => f.division))].sort();
  const isOf = new Map<DivisionId, IncomeStatement>(divisions.map((d) => [d, incomeStatement(state.ledger, from, to, d)]));
  let estimated = false;
  const weight = new Map<number, number>();
  for (const d of divisions) {
    const own = sites.filter((f) => f.division === d);
    const total = own.reduce((a, f) => a + (volume.get(f.id) ?? 0), 0);
    if (total > 0) for (const f of own) weight.set(f.id, (volume.get(f.id) ?? 0) / total);
    else {
      // No recorded volume yet: split evenly over the operating sites.
      estimated = estimated || own.some((f) => f.status === 'operating');
      const live = own.filter((f) => f.status === 'operating');
      for (const f of own) weight.set(f.id, live.includes(f) ? 1 / live.length : 0);
    }
  }

  const corp = incomeStatement(state.ledger, from, to, 'CORP');
  const overheadPool = -corp.localSavings;
  const year = yearOf(to);
  const rows: LocationResult[] = sites.map((f) => {
    const is = isOf.get(f.division)!;
    const w = weight.get(f.id) ?? 0;
    const own = tagged.get(f.id) ?? {};
    const direct = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<OpexGroup, Cents>;
    for (const [acc, v] of Object.entries(own)) { const g = groupOf(acc); if (g) direct[g] += v; }
    const directTotal = GROUPS.reduce((a, g) => a + direct[g], 0);
    // Division costs no site carries: the division's opex and interest less what is tagged to its sites.
    const taggedInDivision = sites.filter((x) => x.division === f.division).reduce((a, x) => a + GROUPS.reduce((b, g) => b + Object.entries(tagged.get(x.id) ?? {}).filter(([acc]) => groupOf(acc) === g).reduce((c, [, v]) => c + v, 0), 0), 0);
    const divisionPool = is.totalOpex + is.interestNet - taggedInDivision;
    const divisionCosts = Math.round(divisionPool * w);
    const grossRevenue = Math.round(is.grossRevenue * w);
    const revenue = Math.round((is.sales + is.serviceIncome) * w);
    const contribution = grossRevenue - directTotal - divisionCosts;
    const nbv = netBookValue(state, f.id);
    const unit = f.division === 'GRAIN' ? 'bu received' : 'sales credited ($)';
    return {
      facilityId: f.id, name: f.name, townId: f.townId, division: f.division, status: f.status,
      volume: volume.get(f.id) ?? 0, volumeUnit: unit, volumeShare: w,
      revenue, grossRevenue, direct, directTotal, divisionCosts, contribution, overhead: 0, net: contribution, bookValue: nbv,
      returnOnAssets: nbv > 0 ? (contribution * (12 / n)) / nbv : 0,
      condition: f.condition, ageYears: year - f.builtYear, staffing: `${f.staffing.level}, pay ${f.staffing.pay}`, maintenance: f.maintenance ?? 'routine',
      capacity: capacityLabel(f),
      why: bd('loc', '', 0),
    };
  });
  // Corporate overhead and interest by gross revenue.
  const grTotal = rows.reduce((a, r) => a + Math.max(0, r.grossRevenue), 0);
  for (const r of rows) {
    r.overhead = grTotal > 0 ? Math.round((overheadPool * Math.max(0, r.grossRevenue)) / grTotal) : 0;
    r.net = r.contribution - r.overhead;
    const d = DIVISION_LABEL[r.division as keyof typeof DIVISION_LABEL] ?? r.division;
    r.why = bd(`loc-${r.facilityId}`, `${r.name}: contribution`, r.contribution, [
      bd('gr', `Gross margin + services: ${(r.volumeShare * 100).toFixed(0)}% of ${d.toLowerCase()}'s, by volume`, r.grossRevenue, undefined, undefined, 'cents'),
      bd('direct', 'Costs booked to this site', -r.directTotal, GROUPS.filter((g) => r.direct[g] !== 0).map((g) => bd(`d-${g}`, GROUP_LABEL[g], -r.direct[g], undefined, undefined, 'cents')), 'Crew, depreciation, repairs, insurance, utilities, property tax, compliance and incidents at this site.', 'cents'),
      bd('division', `Share of ${d.toLowerCase()} costs not tied to a site`, -r.divisionCosts, undefined, 'Selling and delivery costs, bad debt, the division manager and salespeople, spread by volume.', 'cents'),
    ], `Before corporate overhead. ${r.overhead >= 0 ? `Its share of corporate overhead and interest is ${formatCents(r.overhead)}` : `Corporate interest income exceeds overhead, so its share is a credit of ${formatCents(-r.overhead)}`}; after that the site nets ${formatCents(r.net)}.`, 'cents');
  }
  const allocatedGr = rows.reduce((a, r) => a + r.grossRevenue - r.divisionCosts - r.directTotal, 0);
  const divisionTotal = divisions.reduce((a, d) => a + (isOf.get(d)!.localSavings), 0);
  return { from, to, months: n, sites: rows, estimated, unallocated: divisionTotal - allocatedGr };
}
