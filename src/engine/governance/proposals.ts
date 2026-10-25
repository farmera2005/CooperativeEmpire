// Board proposals (DESIGN §14.3): which GM actions need a board vote, and each proposal
// type's evaluator, which produces the merit vector directors react to.

import { INVESTMENTS } from '../../data/investments';
import { toMonthIndex } from '../core/calendar';
import { techById, techCost } from '../world/tech';
import { KIND_DIVISION, KIND_LABEL } from '../../data/facilities';
import { programOf } from '../finance/regionals';
import { CREDIT } from '../../data/supply';
import { formatCents } from '../core/format';
import { clamp } from '../core/math';
import type { Cents } from '../core/money';
import { estimateProject, renovationCost, specComponents } from '../facilities/actions';
import { quoteProject } from '../facilities/projects';
import { grainCapacity, netBookValue } from '../facilities/facilities';
import { covenantSet } from '../finance/covenants';
import { lineRate, liquidity, memberEquity } from '../finance/lender';
import { equityOverview, previewDistribution } from '../finance/selectors';
import { redemptionBudget } from '../finance/redemption';
import { balanceSheet, incomeStatement } from '../ledger/statements';
import { farmStress } from '../supply/credit';
import type { Command } from '../sim/commands';
import type { AgendaItem, DivisionId, GameState, MeritVector, ProposalType } from '../types';
import { nominalCents, pathFor } from '../world/macro';

export const PROPOSAL_LABEL: Record<ProposalType, string> = {
  capitalProject: 'Capital project', facilityClosure: 'Facility closure', patronage: 'Patronage distribution', redemptionPolicy: 'Redemption policy',
  budget: 'Annual budget', deal: 'Merger, sale or joint venture', affiliationChange: 'Regional affiliation', lenderChange: 'Change of lender', borrowing: 'Borrowing',
  riskPolicy: 'Grain risk policy', creditPolicy: 'Customer credit policy', bylawRecommendation: 'Bylaw amendment',
};

/** Cost of a capital command (for the approval threshold), or null if not capital. */
export function capitalCost(s: GameState, cmd: Command): Cents | null {
  switch (cmd.type) {
    case 'buyFacility': return s.coop.offers.find((o) => o.id === cmd.offerId)?.price ?? null;
    case 'buildElevator': return estimateProject(s, cmd.townId, specComponents(cmd.spec)).cost;
    case 'buildFacility': return estimateProject(s, cmd.townId, cmd.components).cost;
    case 'upgradeFacility': {
      const f = s.coop.facilities.find((x) => x.id === cmd.facilityId);
      return f ? estimateProject(s, f.townId, cmd.components, f).cost : null;
    }
    case 'renovateFacility': {
      const f = s.coop.facilities.find((x) => x.id === cmd.facilityId);
      return f ? renovationCost(s, f) : null;
    }
    case 'startProject': return quoteProject(s, cmd.spec).total;
    case 'adoptTech': {
      const t = techById(cmd.techId);
      return t ? techCost(s, t) : null;
    }
    case 'investInVenture': return cmd.amount;
    default: return null;
  }
}

/** Does this GM command need the board? Returns the proposal it becomes, or null. */
export function boardGate(s: GameState, cmd: Command): { type: ProposalType; title: string } | null {
  const fin = s.coop.finance;
  const town = (id: number) => s.world.towns[id]?.name ?? 'town';
  switch (cmd.type) {
    case 'buyFacility':
    case 'buildElevator':
    case 'buildFacility':
    case 'upgradeFacility':
    case 'renovateFacility':
    case 'startProject':
    case 'adoptTech':
    case 'investInVenture': {
      const cost = capitalCost(s, cmd);
      if (cost === null || cost < nominalCents(pathFor(s), s.clock.monthIndex, s.governance.bylaws.capitalApproval)) return null;
      return { type: 'capitalProject', title: capitalTitle(s, cmd, cost) };
    }
    case 'closeFacility': {
      const f = s.coop.facilities.find((x) => x.id === cmd.facilityId);
      return f ? { type: 'facilityClosure', title: `Close ${f.name}` } : null;
    }
    case 'setRedemptionPolicy': return { type: 'redemptionPolicy', title: 'Change the equity redemption program' };
    case 'setAffiliation': return { type: 'affiliationChange', title: `Change ${cmd.category} supplier${cmd.regionalId ? '' : ' to independents'}` };
    case 'switchLender': return { type: 'lenderChange', title: 'Move our loans to a new lender' };
    case 'setLineCommitment': return cmd.amount > fin.lineCommitment ? { type: 'borrowing', title: `Raise the seasonal line to ${formatCents(cmd.amount)}` } : null;
    case 'setGrainPolicy': {
      const p = cmd.policy;
      const cur = s.coop.grainPolicy;
      const lessHedged = p.hedgeRatio !== undefined && p.hedgeRatio < Math.min(0.5, cur.hedgeRatio);
      const biggerLimits = p.positionLimit !== undefined && Object.entries(p.positionLimit).some(([c, v]) => v > cur.positionLimit[c as keyof typeof cur.positionLimit]);
      return lessHedged || biggerLimits ? { type: 'riskPolicy', title: lessHedged ? `Hedge only ${Math.round((p.hedgeRatio ?? 0) * 100)}% of grain owned` : 'Raise open-position limits' } : null;
    }
    case 'setSupplyPolicy':
      return cmd.policy.credit === 'loose' && s.coop.supplyPolicy[cmd.division].credit !== 'loose' ? { type: 'creditPolicy', title: `Loosen customer credit in ${cmd.division.toLowerCase()}` } : null;
    case 'proposeBylaw': return { type: 'bylawRecommendation', title: bylawTitle(cmd.change) };
    default: return null;
  }
  function capitalTitle(st: GameState, c: Command, cost: Cents): string {
    const m = formatCents(cost);
    switch (c.type) {
      case 'buyFacility': {
        const o = st.coop.offers.find((x) => x.id === c.offerId)!;
        return `Buy ${o.sellerName}'s ${KIND_LABEL[o.kind].toLowerCase()} at ${town(o.townId)} for ${m}`;
      }
      case 'buildElevator': return `Build an elevator at ${town(c.townId)} (${m})`;
      case 'buildFacility': return `Build ${/^[aeiou]/i.test(KIND_LABEL[c.kind]) ? 'an' : 'a'} ${KIND_LABEL[c.kind].toLowerCase()} at ${town(c.townId)} (${m})`;
      case 'upgradeFacility': return `Expand ${st.coop.facilities.find((x) => x.id === c.facilityId)?.name} (${m})`;
      case 'renovateFacility': return `Renovate ${st.coop.facilities.find((x) => x.id === c.facilityId)?.name} (${m})`;
      case 'startProject': {
        const f = c.spec.facilityId !== undefined ? st.coop.facilities.find((x) => x.id === c.spec.facilityId) : undefined;
        return f ? `Project at ${f.name} (${m})` : `Build ${/^[aeiou]/i.test(KIND_LABEL[c.spec.kind]) ? 'an' : 'a'} ${KIND_LABEL[c.spec.kind].toLowerCase()} at ${town(c.spec.townId)} (${m})`;
      }
      case 'adoptTech': return `Adopt ${techById(c.techId)?.name ?? 'technology'} (${m})`;
      case 'investInVenture': return `Invest ${m} in ${(st.investOffers ?? []).find((o) => o.id === c.offerId)?.name ?? 'a venture'}`;
      default: return 'Capital project';
    }
  }
}

export function bylawTitle(c: { field: string; value: number | null }): string {
  switch (c.field) {
    case 'boardSize': return `Change the board to ${c.value} directors`;
    case 'termLimit': return c.value === null ? 'Remove director term limits' : `Limit directors to ${c.value} consecutive terms`;
    case 'capitalApproval': return `Board approval for capital projects over $${Math.round(Number(c.value) / 1000)}K (2024 $)`;
    case 'memberPetitionPct': return `Member petitions need ${Math.round(Number(c.value) * 100)}% of active members`;
    default: return 'Bylaw amendment';
  }
}

const blank = (s: GameState): MeritVector => {
  const bs = balanceSheet(s.ledger, s.clock.monthIndex);
  const eq = bs.totalAssets > 0 ? bs.totalEquity / bs.totalAssets : 1;
  return {
    trueMerit: 0, headlineMerit: 0, riskScore: 0, memberCashEffect: 0, equityRatioAfter: eq, covenantHeadroom: eq - covenantSet(s).minEquityRatio,
    townEffects: {}, divisionEffects: {}, growth: 0, controversy: 0.2, notes: [],
  };
};

const trailing = (s: GameState, d: DivisionId) => {
  const mi = s.clock.monthIndex;
  return incomeStatement(s.ledger, Math.max(s.ledger.firstMonth, mi - 11), mi, d);
};

/** Evaluate an agenda item. Pure. */
export function evaluate(s: GameState, item: AgendaItem): MeritVector {
  const v = blank(s);
  const equity = Math.max(1, memberEquity(s));
  const min = covenantSet(s).minEquityRatio;
  const cmd = item.command as Command | undefined;
  const bs = balanceSheet(s.ledger, s.clock.monthIndex);
  switch (item.type) {
    case 'capitalProject': {
      if (!cmd) break;
      const cost = capitalCost(s, cmd) ?? 0;
      // Directors weigh the equity put at risk: the part the lender doesn't finance.
      const financePct = 'financePct' in cmd ? clamp(cmd.financePct, 0, 0.7) : 0;
      const size = (cost * (1 - financePct)) / equity;
      const first = !s.coop.facilities.some((f) => f.status !== 'closed');
      const eqAfter = bs.totalEquity / Math.max(1, bs.totalAssets + cost);
      v.equityRatioAfter = eqAfter;
      v.covenantHeadroom = eqAfter - min;
      let strategic = 0;
      let townId: number | undefined;
      let division: DivisionId | undefined;
      if (cmd.type === 'buyFacility') {
        const o = s.coop.offers.find((x) => x.id === cmd.offerId);
        if (o) {
          townId = o.townId;
          division = KIND_DIVISION[o.kind];
          const owned = s.coop.facilities.some((f) => f.status !== 'closed' && KIND_DIVISION[f.kind] === division);
          strategic += owned ? 0.15 : 0.35;
          if (o.envFound) strategic -= 0.4;
          if (o.diligenceDone) strategic += 0.1;
          else v.notes.push('No due diligence on the facility');
        }
      } else if (cmd.type === 'buildElevator' || cmd.type === 'buildFacility') {
        townId = cmd.townId;
        division = cmd.type === 'buildElevator' ? 'GRAIN' : KIND_DIVISION[cmd.kind];
        const owned = s.coop.facilities.some((f) => f.status !== 'closed' && KIND_DIVISION[f.kind] === division);
        strategic += owned ? 0.05 : 0.3;
      } else if (cmd.type === 'startProject') {
        const sp = cmd.spec;
        const f = sp.facilityId !== undefined ? s.coop.facilities.find((x) => x.id === sp.facilityId) : undefined;
        townId = f?.townId ?? sp.townId;
        division = KIND_DIVISION[f?.kind ?? sp.kind];
        if (!f) strategic += s.coop.facilities.some((x) => x.status !== 'closed' && KIND_DIVISION[x.kind] === division) ? 0.05 : 0.3;
        else if (sp.lines.every((l) => 'rebuildUnitId' in l)) strategic += f.condition < 40 ? 0.5 : 0.1;
        else if (f.kind === 'elevator') strategic += (f.grain.waitMemory > 1.5 ? 0.5 : 0) + (f.grain.seasonTurnedAway > 0 ? 0.3 : 0);
        else strategic += 0.15;
        // Directors trust a plan an outside engineer drew up or will manage.
        if (sp.designId !== undefined || sp.pmId !== undefined) strategic += 0.1;
      } else if (cmd.type === 'investInVenture') {
        // Directors weigh the industry's record: its average return against how much it swings.
        const o = (s.investOffers ?? []).find((x) => x.id === cmd.offerId);
        if (o) {
          const d = INVESTMENTS.value[o.type];
          strategic += 3 * (d.mean - 0.06) - d.sd;
          v.notes.push(`${d.label}: such plants earn about ${Math.round(d.mean * 100)}% a year on equity, swinging ±${Math.round(d.sd * 100)}%`);
        }
      } else if (cmd.type === 'upgradeFacility' || cmd.type === 'renovateFacility') {
        const f = s.coop.facilities.find((x) => x.id === cmd.facilityId);
        if (f) {
          townId = f.townId;
          division = f.division;
          if (cmd.type === 'renovateFacility') strategic += f.condition < 40 ? 0.5 : 0.1;
          else if (f.kind === 'elevator') {
            const cap = grainCapacity(f.components);
            strategic += f.grain.waitMemory > 1.5 ? 0.5 : 0;
            strategic += cap.storageBu > 0 && f.grain.seasonTurnedAway > 0 ? 0.3 : 0;
          } else strategic += 0.15;
        }
      } else if (cmd.type === 'adoptTech') {
        // Directors see proven technology as keeping up; first adopters are a gamble.
        const t = techById(cmd.techId);
        strategic += t && s.clock.monthIndex - toMonthIndex(t.firstYear, 1) > 60 ? 0.35 : 0.15;
      }
      if (division && division !== 'GRAIN') {
        const ts = trailing(s, division);
        if (ts.grossRevenue > 0) strategic += clamp(ts.localSavings / Math.max(1, ts.grossRevenue), -0.5, 0.5);
      }
      v.riskScore = clamp(size * 0.6 + (v.covenantHeadroom < 0.05 ? 0.4 : 0) + (liquidity(s) < cost * 0.3 ? 0.2 : 0), 0, 1);
      // The members organized the co-op to own a facility: the first one is what the board is for.
      if (first) strategic += 0.6;
      v.trueMerit = clamp(0.8 * strategic + 3 * clamp(v.covenantHeadroom, -0.3, 0.1) - 0.6 * v.riskScore, -1, 1);
      v.headlineMerit = clamp((first ? 0.7 : 0.3) - 0.6 * clamp(size, 0, 1.5), -1, 1);
      v.growth = 1;
      v.controversy = clamp(0.1 + size * 0.4, 0, 1);
      if (townId !== undefined) v.townEffects[townId] = 1;
      if (division) v.divisionEffects[division] = 1;
      if (v.covenantHeadroom < 0) v.notes.push('Owner equity would fall below the loan covenant');
      v.notes.push(`Cost ${formatCents(cost)} is ${Math.round(size * 100)}% of member equity`);
      break;
    }
    case 'facilityClosure': {
      if (cmd?.type !== 'closeFacility') break;
      const f = s.coop.facilities.find((x) => x.id === cmd.facilityId);
      if (!f) break;
      const ts = trailing(s, f.division);
      const losing = ts.localSavings < 0;
      v.trueMerit = clamp((losing ? 0.4 : -0.3) + (f.condition < 35 ? 0.3 : 0) + (f.status === 'mothballed' ? 0.3 : 0), -1, 1);
      v.headlineMerit = -0.4;
      v.townEffects[f.townId] = -1;
      v.divisionEffects[f.division] = -1;
      v.growth = -0.5;
      v.controversy = 0.6;
      v.notes.push(losing ? `${f.division.toLowerCase()} lost ${formatCents(-ts.localSavings)} over the last year` : `${f.division.toLowerCase()} made money over the last year`);
      break;
    }
    case 'patronage': {
      const p = s.coop.equityProgram.proposal;
      const pv = previewDistribution(s, p);
      if (!pv) break;
      const sm = pv.summary;
      const alloc = sm.cash + sm.qualified + sm.nonqualified;
      v.equityRatioAfter = pv.equityRatioAfter;
      v.covenantHeadroom = pv.equityRatioAfter - min;
      if (alloc <= 0) {
        // Nothing to allocate: the vote is a formality.
        v.trueMerit = 0.5;
        v.headlineMerit = 0;
        v.controversy = 0.05;
        v.notes.push('No patronage to allocate this year');
        break;
      }
      const cashPct = sm.cash / alloc;
      // Judge the cash against the minimum-cash alternative: only extra cash costs equity.
      const lean = previewDistribution(s, { ...p, pools: { ALL: { cash: 0.2, qualified: 0.8, nonqualified: 0, unallocated: 0 } } });
      const equityCost = Math.max(0, (lean?.equityRatioAfter ?? pv.equityRatioAfter) - pv.equityRatioAfter);
      v.memberCashEffect = clamp((cashPct - 0.3) * 2, -1, 1);
      const taxPain = sm.patrons > 0 ? sm.taxOverCheck / sm.patrons : 0;
      v.trueMerit = clamp(0.4 - equityCost * (v.covenantHeadroom < 0.1 ? 15 : 5) - 0.5 * taxPain - (sm.nonqualified > sm.qualified ? 0.2 : 0), -1, 1);
      v.headlineMerit = clamp(0.2 + cashPct - 0.3 - taxPain, -1, 1);
      v.growth = -v.memberCashEffect * 0.5;
      v.controversy = clamp(Math.abs(cashPct - 0.3) + taxPain * 0.5, 0, 1);
      v.notes.push(`${Math.round(cashPct * 100)}% cash; ${sm.taxOverCheck} members owe more tax than their check`);
      break;
    }
    case 'redemptionPolicy': {
      if (cmd?.type !== 'setRedemptionPolicy') break;
      const cur = redemptionBudget(s);
      const last = s.coop.equityProgram.history[s.coop.equityProgram.history.length - 1];
      const sav = last ? Math.max(0, last.savingsBeforeTax - last.tax) : 0;
      const next = cmd.policy.budgetFixed + sav * cmd.policy.budgetPctOfSavings;
      const delta = (next - cur) / equity;
      const ov = equityOverview(s);
      v.memberCashEffect = clamp(delta * 20, -1, 1);
      v.trueMerit = clamp(0.4 * ov.inactiveShare - 4 * Math.max(0, delta) + (v.covenantHeadroom > 0.1 ? 0.2 : -0.3), -1, 1);
      v.headlineMerit = clamp(Math.sign(delta) * 0.4, -1, 1);
      v.growth = -Math.sign(delta) * 0.3;
      v.controversy = clamp(Math.abs(delta) * 10, 0.1, 0.8);
      v.notes.push(`Redemption budget would be about ${formatCents(Math.round(next))} a year (now ${formatCents(cur)})`);
      break;
    }
    case 'budget': {
      const b = s.coop.budget;
      if (!b) break;
      const ls = Object.values(b.lines).reduce((a, x) => a + x.localSavings, 0);
      // A budget is a plan: directors object to its capital ask more than to its forecast.
      v.trueMerit = clamp(0.4 + clamp(ls / equity, -0.3, 0.3), -1, 1);
      v.headlineMerit = ls >= 0 ? 0.3 : 0;
      v.controversy = clamp(0.05 + (b.capex / equity) * 0.3, 0, 1);
      v.growth = clamp(b.capex / equity, 0, 1);
      v.notes.push(`Budgeted local savings ${formatCents(ls)}; capital ${formatCents(b.capex)}`);
      break;
    }
    case 'affiliationChange': {
      if (cmd?.type !== 'setAffiliation') break;
      const cur = s.coop.regionalAffiliations.find((a) => a.lines.includes(cmd.category))?.regionalId;
      const rate = (id?: string | null) => (id ? (programOf(id).rate[cmd.category] ?? 0) * programOf(id).cashPortion : 0);
      v.trueMerit = clamp((rate(cmd.regionalId) - rate(cur)) * 0.5 - 0.1, -1, 1);
      v.headlineMerit = -0.1;
      v.controversy = 0.3;
      break;
    }
    case 'lenderChange': {
      if (cmd?.type !== 'switchLender') break;
      const diff = lineRate(s) - lineRate(s, s.clock.monthIndex, cmd.lenderId);
      v.trueMerit = clamp(diff * 0.4 + (cmd.lenderId === 'local-bank' ? -0.2 : 0.1), -1, 1);
      v.headlineMerit = diff > 0 ? 0.2 : -0.2;
      v.controversy = 0.3;
      break;
    }
    case 'borrowing': {
      if (cmd?.type !== 'setLineCommitment') break;
      const peak = Math.max(...s.history.slice(-12).map((h) => h.lineDrawn), 0);
      const need = s.coop.finance.lineCommitment > 0 ? peak / s.coop.finance.lineCommitment : 1;
      v.trueMerit = clamp(need - 0.7 + clamp(v.covenantHeadroom, -0.2, 0.1) * 2, -1, 1);
      v.headlineMerit = -0.2;
      v.riskScore = 0.3;
      v.growth = 0.3;
      v.controversy = 0.25;
      break;
    }
    case 'riskPolicy': {
      if (cmd?.type !== 'setGrainPolicy') break;
      const h = cmd.policy.hedgeRatio ?? s.coop.grainPolicy.hedgeRatio;
      v.riskScore = clamp(1 - h, 0, 1);
      v.trueMerit = clamp(-0.8 * v.riskScore + 0.1, -1, 1);
      v.headlineMerit = 0;
      v.growth = 0.3;
      v.controversy = 0.5;
      v.notes.push('Unhedged grain exposes member equity to price swings');
      break;
    }
    case 'creditPolicy': {
      const stress = farmStress({ state: s, path: pathFor(s), mi: s.clock.monthIndex } as Parameters<typeof farmStress>[0]);
      v.trueMerit = clamp(-0.2 - stress * 2 + (CREDIT.collectRate.value.loose < 0.5 ? -0.1 : 0), -1, 1);
      v.headlineMerit = 0.2;
      v.memberCashEffect = 0.2;
      v.riskScore = clamp(0.3 + stress, 0, 1);
      v.controversy = 0.3;
      break;
    }
    case 'deal': {
      const d = s.deals.find((x) => x.id === (item.command as { dealId?: number } | undefined)?.dealId);
      if (!d) break;
      const e = d.estimate;
      const ours = s.coop.facilities.filter((f) => f.status !== 'closed');
      if (d.kind === 'merger') {
        const near = s.competitors.find((c) => c.id === d.partnerId)?.sites.some((x) => ours.some((f) => (s.world.distances[f.townId]?.[x.townId] ?? 99) <= 20)) ?? false;
        v.trueMerit = clamp((e.strength - 45) / 50 + (near ? 0.2 : 0) - (e.debt > e.fairValue * 0.6 ? 0.3 : 0) - (d.diligence ? 0 : 0.15), -1, 1);
        v.headlineMerit = 0.2;
        v.growth = 1;
        v.controversy = 0.6;
        v.notes.push(`${d.partnerName}: ${e.sites} site(s), plants ${formatCents(e.fairValue)}, debt ${formatCents(e.debt)}${d.diligence ? '' : ' (estimates; no diligence)'}`);
      } else if (d.kind === 'jv') {
        v.trueMerit = clamp(0.25 + (e.strength - 50) / 100, -1, 1);
        v.headlineMerit = 0.1;
        v.controversy = 0.4;
        if (d.division) v.divisionEffects[d.division] = -0.5;
      } else if (d.kind === 'divisionSale') {
        const ts = trailing(s, d.division!);
        const book = s.coop.facilities.filter((f) => f.division === d.division && f.status !== 'closed').reduce((a, f) => a + netBookValue(s, f.id), 0) + d.truth.workingCapital;
        v.trueMerit = clamp(((d.terms?.price ?? 0) / Math.max(1, book) - 1) + (ts.localSavings < 0 ? 0.35 : -0.3), -1, 1);
        v.headlineMerit = -0.3;
        v.growth = -1;
        v.controversy = 0.6;
        if (d.division) v.divisionEffects[d.division] = -1;
        v.notes.push(`Price ${formatCents(d.terms?.price ?? 0)} vs book ${formatCents(book)}; the division ${ts.localSavings < 0 ? 'lost' : 'made'} ${formatCents(Math.abs(ts.localSavings))} last year`);
      } else if (d.kind === 'acquisition') {
        // Directors judge the price against the appraisal, the fit with our trade area and the bite out of equity.
        const price = d.terms?.price ?? 0;
        const value = e.fairValue + e.workingCapital;
        const equity = Math.max(1, balanceSheet(s.ledger, s.clock.monthIndex).totalEquity);
        const near = s.competitors.find((c) => c.id === d.partnerId)?.sites.some((x) => ours.some((f) => (s.world.distances[f.townId]?.[x.townId] ?? 99) <= 20)) ?? false;
        v.trueMerit = clamp(2 * (value / Math.max(1, price) - 1) + (near ? 0.15 : -0.1) + (e.strength - 50) / 200 - (price > 0.5 * equity ? 0.3 : 0) - (d.diligence ? 0 : 0.15), -1, 1);
        v.headlineMerit = 0.3;
        v.growth = 0.8;
        v.controversy = 0.4;
        v.notes.push(`${d.partnerName}: ${e.sites} site(s); price ${formatCents(price)} against plants and working capital of ${formatCents(value)}${d.diligence ? '' : ' (estimates; no diligence)'}`);
      } else {
        const premium = (d.terms?.price ?? 0) / Math.max(1, balanceSheet(s.ledger, s.clock.monthIndex).totalEquity);
        v.trueMerit = clamp(premium - 1.1 + (s.coop.finance.status !== 'standard' ? 0.4 : -0.2), -1, 1);
        v.headlineMerit = -0.5;
        v.growth = -1;
        v.controversy = 0.9;
        v.notes.push(`Offer is ${Math.round(premium * 100)}% of member equity`);
      }
      break;
    }
    case 'bylawRecommendation': {
      const c = item.bylaw;
      if (!c) break;
      if (c.field === 'capitalApproval') v.trueMerit = c.value > s.governance.bylaws.capitalApproval ? -0.3 : 0.2;
      else if (c.field === 'termLimit') v.trueMerit = c.value === null ? -0.1 : 0.1;
      else if (c.field === 'memberPetitionPct') v.trueMerit = c.value < s.governance.bylaws.memberPetitionPct ? -0.2 : 0.1;
      else v.trueMerit = 0;
      v.headlineMerit = 0;
      v.controversy = 0.4;
      break;
    }
  }
  return v;
}
