// Leaders' monthly notes (DESIGN §15): each leader reports and recommends. Forecasts look
// at what the market will actually do, blurred by noise that shrinks with skill — a good
// merchandiser's read on carry is usually right, a weak one's is a coin toss.

import { NOTES, ROLE_DEFS, type Role, type Skill } from '../../data/people';
import { formatMonth, monthOf } from '../core/calendar';
import { clamp } from '../core/math';
import { formatCents } from '../core/format';
import { budgetVsActual } from '../finance/budget';
import { incomeStatement } from '../ledger/statements';
import type { TickContext } from '../sim/context';
import type { GameState, Leader, LeaderNote } from '../types';
import { marketValue } from '../world/marketPath';
import { averageSatisfaction } from '../governance/review';
import { effect, effectiveSkill } from './leaders';

const NOTE_SKILL: Partial<Record<Role, Skill>> = {
  GRAIN: 'merchandising', AGRONOMY: 'merchandising', ENERGY: 'merchandising', FEED: 'sales', RETAIL: 'sales', CFO: 'finance', COO: 'operations',
  SAFETY: 'safety', HR: 'leadership', MARKETING: 'memberRelations', IT: 'innovation',
};

/** Relative noise in a leader's forecast at the effective skill. */
export const noiseFor = (s: GameState, role: Role): number => NOTES.noiseAtSkill1.value * clamp((20 - effectiveSkill(s, role, NOTE_SKILL[role] ?? 'operations')) / 19, 0.03, 1.2);

const pctChange = (ctx: TickContext, series: Parameters<typeof marketValue>[1], ahead: number) =>
  marketValue(ctx.path, series, ctx.mi + ahead) / marketValue(ctx.path, series, ctx.mi) - 1;

function note(ctx: TickContext, l: Leader): string | null {
  const { state, mi } = ctx;
  const rng = ctx.rng('people.notes', l.id);
  const sd = noiseFor(state, l.role);
  const fuzzy = (x: number, scale: number) => x + rng.normal(0, sd * scale);
  switch (l.role) {
    case 'GRAIN': {
      const ch = fuzzy(pctChange(ctx, 'corn', 3), 0.12);
      const dir = ch > 0.02 ? 'rise' : ch < -0.02 ? 'fall' : 'hold about steady';
      return `Corn futures should ${dir} over the next three months (my guess: ${ch >= 0 ? '+' : ''}${Math.round(ch * 100)}%). ${ch > 0.04 ? 'Carry looks worth storing for; I would keep the house full and hedged.' : ch < -0.04 ? 'I would move grain early and keep hedges tight.' : 'Nothing to chase; stay hedged and ship to the best basis.'}`;
    }
    case 'AGRONOMY': {
      const ch = fuzzy(pctChange(ctx, 'anhydrous', 6), 0.15);
      return `Nitrogen by ${formatMonth(mi + 6)}: ${ch >= 0 ? 'up' : 'down'} about ${Math.abs(Math.round(ch * 100))}%. ${ch > 0.08 ? 'Fill heavier now.' : ch < -0.08 ? 'Keep fills light; we could be writing inventory down.' : 'A normal fill is fine.'}`;
    }
    case 'ENERGY': {
      const winter = monthOf(mi) >= 5 && monthOf(mi) <= 9;
      const ch = fuzzy(pctChange(ctx, 'propane', winter ? 12 - monthOf(mi) + 1 : 3), 0.15);
      return `Propane ${winter ? 'this coming winter' : 'over the next three months'}: ${ch >= 0 ? 'up' : 'down'} about ${Math.abs(Math.round(ch * 100))}%. ${winter && ch > 0.1 ? 'Cover the prebuy contracts with supply now.' : winter && ch < -0.1 ? 'Prebuy customers may regret it; keep cover light.' : 'Steady as she goes.'}`;
    }
    case 'CFO': {
      const b = budgetVsActual(state);
      if (!b) return 'No budget this year to track against.';
      const planned = b.rows.reduce((a, r) => a + r.budget.localSavings, 0);
      const actual = b.rows.reduce((a, r) => a + r.actual.localSavings, 0);
      const full = actual + ((12 - b.elapsedMonths) / 12) * planned;
      const err = 1 + effect(state, 'finance.forecast');
      const guess = Math.round(full * (1 + rng.normal(0, 0.25 * err * sd)));
      return `Projecting local savings of ${formatCents(guess)} for fiscal ${b.fy} against a budget of ${formatCents(planned)}.`;
    }
    case 'COO': {
      const worn = state.coop.facilities.filter((f) => f.status === 'operating' && f.condition < 40);
      return worn.length ? `${worn.map((f) => f.name).join(', ')} ${worn.length > 1 ? 'need' : 'needs'} renovation before something breaks at harvest.` : 'Plants are in reasonable shape.';
    }
    case 'SAFETY': {
      const lean = state.coop.facilities.filter((f) => f.status === 'operating' && f.staffing.level === 'lean');
      const recent = state.people.incidents.filter((i) => mi - i.monthIndex < 12).length;
      return `${recent} recordable incident${recent === 1 ? '' : 's'} in the last year.${lean.length ? ` Lean crews at ${lean.map((f) => f.name).join(', ')} worry me.` : ''} Training budget: ${state.people.training}.`;
    }
    case 'HR': {
      const w = Object.entries(state.people.workforce);
      const worst = w.sort((a, b) => b[1]!.turnover - a[1]!.turnover)[0];
      return worst ? `Turnover is running ${Math.round(worst[1]!.turnover * 100)}% a year in ${worst[0].toLowerCase()}; ${Math.round(worst[1]!.vacancy * 100)}% of positions are open.` : 'Staffing is stable.';
    }
    case 'MARKETING': {
      const sat = fuzzy(averageSatisfaction(state), 8);
      return `Members are ${sat > 55 ? 'content' : sat > 45 ? 'mixed' : 'grumbling'} (my read: ${Math.round(sat)}). ${sat < 45 ? 'Expect challengers at the annual meeting.' : ''}`;
    }
    case 'FEED':
    case 'RETAIL': {
      const d = l.role;
      const is = incomeStatement(state.ledger, Math.max(state.ledger.firstMonth, mi - 2), mi, d);
      return `Last three months: sales ${formatCents(is.sales)}, local savings ${formatCents(is.localSavings)}.`;
    }
    case 'IT':
      return 'Systems are running. Nothing new worth buying this month.';
  }
  return null;
}

export function stepNotes(ctx: TickContext): void {
  const out: LeaderNote[] = [];
  for (const l of ctx.state.people.leaders) {
    const text = note(ctx, l);
    if (text) out.push({ role: l.role, leaderId: l.id, text: `${l.name} (${ROLE_DEFS[l.role].label}): ${text}` });
  }
  ctx.state.people.notes = out;
}
