// Lender (DESIGN §12): seasonal line with a commitment and a monthly borrowing base,
// amortizing term loans, interest, the cash sweep, co-op bank stock and patronage, and the
// lender's risk spread from covenant standing (covenants.ts).

import { brandsAvailable, getBrand } from '../../data/brands';
import { COVENANTS, LENDER, lenderKind } from '../../data/finance';
import { LENDING } from '../../data/tuning';
import { valueAt } from '../../data/types';
import { yearOf } from '../core/calendar';
import { roundCents, type Cents } from '../core/money';
import { formatCents } from '../core/format';
import { balance, post } from '../ledger/ledger';
import { balanceSheet } from '../ledger/statements';
import type { TickContext } from '../sim/context';
import type { FinanceState, GameState, TermLoan } from '../types';
import { nominalCents, pathFor } from '../world/macro';
import { marketValue } from '../world/marketPath';
import { grainCapacity } from '../facilities/facilities';
import { effect } from '../people/leaders';

export function lineRate(state: GameState, mi = state.clock.monthIndex, lenderId = state.coop.lenderId): number {
  const spread = LENDING.spreadOverPrime[lenderId]?.value ?? LENDING.spreadOverPrime['local-bank'].value;
  // The CFO's standing with the lender moves the spread.
  // The co-op banks priced loans on the Farm Credit System's average cost of funds, so their
  // rates trailed the market: below prime in the 1979–82 spike, above it in 1984–86 (D-097).
  const path = pathFor(state);
  let base = marketValue(path, 'prime', mi);
  if (lenderKind(lenderId) === 'coopBank') {
    let sum = 0;
    for (let k = 0; k < LENDING.coopBankAveragingMonths; k++) sum += marketValue(path, 'prime', mi - k);
    base = sum / LENDING.coopBankAveragingMonths;
  }
  return base + spread + (lenderId === state.coop.lenderId ? state.coop.finance.riskSpread : 0) + effect(state, 'finance.spread');
}

export const memberEquity = (state: GameState): Cents => balanceSheet(state.ledger, state.clock.monthIndex).totalEquity;

/** Borrowing base: eligible assets at advance rates plus an unsecured slice of equity. */
export function borrowingBase(state: GameState): Cents {
  const adv = LENDING.advance.value;
  const l = state.ledger;
  let hedged = 0;
  let unhedged = 0;
  for (const p of Object.values(state.coop.grain.pos)) {
    const net = Math.max(0, p.ownedBu - p.dpBu);
    const hedgedShare = net > 0 ? Math.min(1, p.shortBu / net) : 1;
    hedged += p.book * hedgedShare;
    unhedged += p.book * (1 - hedgedShare);
  }
  const other = balance(l, '1210') + balance(l, '1220') + balance(l, '1230') + balance(l, '1240');
  const base = adv.receivables * Math.max(0, balance(l, '1100') + balance(l, '1150'))
    + adv.hedgedGrain * hedged + adv.unhedgedGrain * unhedged + adv.otherInventory * other
    + adv.marginDeposits * Math.max(0, balance(l, '1310'))
    + LENDING.unsecuredEquityShare.value * Math.max(0, memberEquity(state));
  return Math.max(0, roundCents(base));
}

export function lineDrawn(state: GameState): Cents {
  return -balance(state.ledger, '2000');
}

/** Cash plus undrawn line the co-op could spend right now. */
export function liquidity(state: GameState): Cents {
  const f = state.coop.finance;
  const avail = Math.min(f.lineCommitment, borrowingBase(state)) - lineDrawn(state);
  return balance(state.ledger, '1000') + Math.max(0, avail);
}

export function defaultCommitment(state: GameState): Cents {
  return roundCents(Math.max(0, memberEquity(state)) * LENDING.defaultCommitmentEquityMultiple.value);
}

/** Line the lender offers at renewal: equity-based floor or enough to carry a full house of grain. */
export function renewalCommitment(state: GameState): Cents {
  const path = pathFor(state);
  const mi = state.clock.monthIndex;
  let need = 0;
  for (const f of state.coop.facilities) {
    if (f.status === 'closed') continue;
    const cap = grainCapacity(f.components);
    need += (cap.storageBu + cap.pileBu) * marketValue(path, 'soybeans', mi) * 0.5 + (cap.storageBu + cap.pileBu) * marketValue(path, 'corn', mi) * 0.5;
  }
  const want = Math.max(defaultCommitment(state), roundCents(need * LENDING.inventoryFinanceShare.value * 100));
  return Math.min(want, maxCommitment(state));
}

export function maxCommitment(state: GameState): Cents {
  return roundCents(Math.max(0, memberEquity(state)) * LENDING.maxCommitmentEquityMultiple.value);
}

export function emptyFinance(): FinanceState {
  return {
    status: 'standard', riskSpread: 0, breachQuarters: 0, okQuarters: 0, lastTest: null, lenderEquity: {}, loanSum: 0, loanMonths: 0,
    lineCommitment: 0, borrowingBase: 0, lineAvailable: 0, overLimit: false, termLoans: [], nextLoanId: 1, lastLineRate: 0,
  };
}

export const totalDebt = (state: GameState): Cents => lineDrawn(state) + state.coop.finance.termLoans.reduce((s, l) => s + l.balance, 0);

export function lenderEquityHeld(state: GameState, lenderId?: string): Cents {
  let t = 0;
  for (const [id, v] of Object.entries(state.coop.finance.lenderEquity)) {
    if (lenderId && id !== lenderId) continue;
    for (const y in v) t += v[y];
  }
  return t;
}

/**
 * Annual co-op bank patronage on the past year's average loans: part cash, part lender stock.
 * The stock portion is raised when holdings are below the bank's target, and stock above
 * the target (or held in a former lender) is retired, oldest first.
 */
export function stepLenderPatronage(ctx: TickContext): void {
  const { state } = ctx;
  const fin = state.coop.finance;
  if (ctx.month !== LENDER.patronageMonth) return;
  const id = state.coop.lenderId;
  const avg = fin.loanMonths > 0 ? roundCents(fin.loanSum / fin.loanMonths) : 0;
  fin.loanSum = 0;
  fin.loanMonths = 0;
  if (lenderKind(id) === 'coopBank' && avg > 0) {
    const rate = valueAt(LENDER.patronageRate[id] ?? [], ctx.year - 1) / 100;
    const amount = roundCents(avg * rate);
    if (amount > 0) {
      const target = roundCents(avg * (LENDER.equityTarget[id]?.value ?? 0));
      const shortfall = Math.max(0, target - lenderEquityHeld(state, id));
      const stock = Math.min(amount, Math.max(roundCents(amount * (1 - (LENDER.patronageCash[id]?.value ?? 0.5))), shortfall));
      const cash = amount - stock;
      const v = (fin.lenderEquity[id] ??= {});
      v[ctx.year] = (v[ctx.year] ?? 0) + stock;
      post(state, {
        source: 'lender-patronage', memo: `Patronage from ${brandLabel(id)}`,
        lines: [{ account: '1000', division: 'CORP', amount: cash }, { account: '1400', division: 'CORP', amount: stock }, { account: '8110', division: 'CORP', amount: -amount }],
      });
      ctx.inbox({ kind: 'memo', title: 'Lender patronage', body: `${brandLabel(id)} paid patronage of ${formatCents(amount)} on our average loan balance of ${formatCents(avg)}: ${formatCents(cash)} in cash and ${formatCents(stock)} in bank stock.` });
    }
  }
  // Retire lender stock above target.
  let retired = 0;
  for (const lid of Object.keys(fin.lenderEquity).sort()) {
    const target = lid === id ? roundCents(avg * (LENDER.equityTarget[lid]?.value ?? 0)) : 0;
    let excess = lenderEquityHeld(state, lid) - target;
    const v = fin.lenderEquity[lid];
    for (const y of Object.keys(v).map(Number).sort((a, b) => a - b)) {
      if (excess <= 0) break;
      const take = Math.min(excess, v[y]);
      v[y] -= take;
      excess -= take;
      retired += take;
      if (v[y] === 0) delete v[y];
    }
    if (Object.keys(v).length === 0) delete fin.lenderEquity[lid];
  }
  if (retired > 0) post(state, { source: 'lender-equity-retired', memo: 'Lender stock retired', lines: [{ account: '1000', division: 'CORP', amount: retired }, { account: '1400', division: 'CORP', amount: -retired }] });
}

/**
 * Convert part of the seasonal line into an amortizing term loan ("terming out" working
 * capital): enough to bring the current ratio to `targetRatio`, limited by the line drawn
 * and by the term-debt covenant. Returns the amount converted.
 */
export function termOutLine(state: GameState, targetRatio: number, maxTermToFixed: number): Cents {
  const bs = balanceSheet(state.ledger, state.clock.monthIndex);
  const ca = bs.currentAssets.reduce((s, x) => s + x.amount, 0);
  const cl = bs.currentLiabilities.reduce((s, x) => s + x.amount, 0);
  const need = Math.ceil(cl - ca / targetRatio);
  const fixed = bs.fixedAssets.reduce((s, x) => s + x.amount, 0) + state.coop.projects.reduce((s, p) => s + Math.max(0, p.budget - p.spent), 0);
  const term = state.coop.finance.termLoans.reduce((s, l) => s + l.balance, 0);
  const room = Math.floor(maxTermToFixed * fixed - term);
  const amount = Math.max(0, Math.min(need, lineDrawn(state), room));
  if (amount < 100_000) return 0;
  const f = state.coop.finance;
  const rate = lineRate(state) + LENDING.termSpread.value;
  const months = LENDING.termLoanMonths.value;
  f.termLoans.push({ id: f.nextLoanId++, purpose: 'Working capital (termed-out line)', principal: amount, balance: amount, ratePct: rate, payment: loanPayment(amount, rate, months), startMonth: state.clock.monthIndex, months });
  post(state, { source: 'term-out', memo: 'Convert seasonal line to a term loan', lines: [{ account: '2000', division: 'CORP', amount }, { account: '2300', division: 'CORP', amount: -amount }] });
  return amount;
}

/** A lender brand that ends hands the relationship to its successor (Banks for Cooperatives → CoBank). */
export function stepLenderSuccession(ctx: TickContext): void {
  const { state } = ctx;
  const br = getBrand(state.coop.lenderId);
  if (!br || br.availableTo === undefined || ctx.year < br.availableTo || !br.successor) return;
  const fin = state.coop.finance;
  const old = state.coop.lenderId;
  state.coop.lenderId = br.successor;
  if (fin.lenderEquity[old]) {
    const to = (fin.lenderEquity[br.successor] ??= {});
    for (const [y, c] of Object.entries(fin.lenderEquity[old])) to[Number(y)] = (to[Number(y)] ?? 0) + c;
    delete fin.lenderEquity[old];
  }
  ctx.inbox({ kind: 'memo', title: `Our lender is now ${brandLabel(br.successor)}`, body: `${brandLabel(old)} has been consolidated into ${brandLabel(br.successor)}. Our loans, line of credit and bank stock carry over unchanged.` });
}

export function brandLabel(id: string): string {
  return id === 'local-bank' ? 'the bank' : getBrand(id)?.name ?? id;
}

/** Move the co-op's borrowing to another lender: fee, term loans repriced at the new lender's rate. */
export function switchLender(state: GameState, lenderId: string): string | null {
  const fin = state.coop.finance;
  if (lenderId === state.coop.lenderId) return 'That is already our lender.';
  if (fin.status !== 'standard' && fin.status !== 'watch') return 'No lender will take over our loans while we are in breach of covenants.';
  const available = lenderId === 'local-bank' || (getBrand(lenderId) && brandsAvailable('lender', yearOf(state.clock.monthIndex)).some((b) => b.id === lenderId));
  if (!available) return 'That lender is not available.';
  const fee = roundCents(totalDebt(state) * LENDER.switchFee.value);
  if (fee > 0) post(state, { source: 'lender-switch', memo: 'Loan fees for refinancing with a new lender', lines: [{ account: '7600', division: 'CORP', amount: fee }, { account: '1000', division: 'CORP', amount: -fee }] });
  state.coop.lenderId = lenderId;
  fin.riskSpread = fin.status === 'watch' ? COVENANTS.watchSpread.value : 0;
  const rate = lineRate(state) + LENDING.termSpread.value;
  for (const loan of fin.termLoans) {
    const remaining = Math.max(12, loan.months - (state.clock.monthIndex - loan.startMonth));
    loan.ratePct = rate;
    loan.payment = loanPayment(loan.balance, rate, remaining);
    loan.principal = loan.balance;
    loan.months = remaining;
    loan.startMonth = state.clock.monthIndex;
  }
  return null;
}

/** Level monthly payment for an amortizing loan. */
export function loanPayment(principal: Cents, annualRatePct: number, months: number): Cents {
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return roundCents(principal / months);
  return roundCents((principal * r) / (1 - Math.pow(1 + r, -months)));
}

export function createTermLoan(state: GameState, principal: Cents, purpose: string): TermLoan | null {
  if (principal <= 0) return null;
  const f = state.coop.finance;
  const rate = lineRate(state) + LENDING.termSpread.value;
  const months = LENDING.termLoanMonths.value;
  const loan: TermLoan = { id: f.nextLoanId++, purpose, principal, balance: principal, ratePct: rate, payment: loanPayment(principal, rate, months), startMonth: state.clock.monthIndex, months };
  f.termLoans.push(loan);
  post(state, {
    source: 'term-loan', memo: `Term loan: ${purpose}`,
    lines: [{ account: '1000', division: 'CORP', amount: principal }, { account: '2300', division: 'CORP', amount: -principal }],
  });
  return loan;
}

/** Monthly: interest and principal on term loans, line interest, borrowing base, sweep. */
export function stepLender(ctx: TickContext): void {
  const { state } = ctx;
  const fin = state.coop.finance;
  // Annual renewal of the seasonal line each September, ahead of harvest.
  if (ctx.month === LENDING.renewalMonth) {
    let offer = renewalCommitment(state);
    if (fin.status === 'specialCredit' || fin.status === 'forcedAction') offer = Math.min(offer, fin.lineCommitment);
    const [c0, c1] = COVENANTS.crisisYears;
    if (lenderKind(state.coop.lenderId) === 'commercial' && fin.status !== 'standard' && ctx.year >= c0 && ctx.year <= c1) {
      offer = Math.min(offer, roundCents(fin.lineCommitment * (1 - COVENANTS.crisisLineCut.value)));
      ctx.inbox({ kind: 'alert', title: 'The bank is cutting our line', body: `With farm loans going bad across the Corn Belt, ${brandLabel(state.coop.lenderId)} is reducing exposure to borrowers on its watch list. Our seasonal line is cut to ${formatCents(offer)}.` });
    }
    const [k0, k1] = COVENANTS.crunchYears;
    if (fin.status !== 'standard' && ctx.year >= k0 && ctx.year <= k1) {
      offer = Math.min(offer, roundCents(fin.lineCommitment * (1 - COVENANTS.crunchLineCut.value[lenderKind(state.coop.lenderId)])));
      ctx.inbox({ kind: 'alert', title: 'Credit crunch: our line is cut', body: `With credit markets frozen, ${brandLabel(state.coop.lenderId)} is shrinking its exposure to borrowers out of compliance. Our seasonal line is cut to ${formatCents(offer)}.` });
    }
    if (offer !== fin.lineCommitment) {
      ctx.inbox({ kind: 'memo', title: 'Seasonal line renewed', body: `The lender renewed the seasonal line at ${formatCents(offer)} (was ${formatCents(fin.lineCommitment)}), sized to our storage and member equity.` });
      fin.lineCommitment = offer;
    }
  }

  // Term loans (rates fixed at origination).
  for (const loan of fin.termLoans) {
    if (loan.balance <= 0) continue;
    const interest = roundCents((loan.balance * loan.ratePct) / 100 / 12);
    const principal = Math.min(loan.balance, Math.max(0, loan.payment - interest));
    loan.balance -= principal;
    post(state, {
      source: 'term-loan-payment', memo: `Term loan payment: ${loan.purpose}`,
      lines: [
        { account: '8000', division: 'CORP', amount: interest },
        { account: '2300', division: 'CORP', amount: principal },
        { account: '1000', division: 'CORP', amount: -(interest + principal) },
      ],
    });
  }
  fin.termLoans = fin.termLoans.filter((l) => l.balance > 0);

  // Line interest on the opening balance.
  const drawn = lineDrawn(state);
  const rate = lineRate(state) + (fin.overLimit ? LENDING.overLimitPenalty.value : 0);
  fin.lastLineRate = rate;
  if (drawn > 0) {
    const interest = roundCents((drawn * rate) / 100 / 12);
    post(state, {
      source: 'line-interest', memo: 'Interest on seasonal line of credit',
      lines: [{ account: '8000', division: 'CORP', amount: interest }, { account: '1000', division: 'CORP', amount: -interest }],
    });
  }
  sweep(ctx);
  fin.loanSum += totalDebt(state);
  fin.loanMonths += 1;
}

/** Cover negative cash from the line; repay from cash above the buffer. */
export function sweep(ctx: TickContext): void {
  const { state } = ctx;
  const fin = state.coop.finance;
  const cash = balance(state.ledger, '1000');
  const line = lineDrawn(state);
  const buffer = nominalCents(ctx.path, ctx.mi, LENDING.cashBuffer.value);
  if (cash < 0) {
    post(state, {
      source: 'line-draw', memo: 'Draw on seasonal line of credit',
      lines: [{ account: '1000', division: 'CORP', amount: -cash }, { account: '2000', division: 'CORP', amount: cash }],
    });
  } else if (line > 0 && cash > buffer) {
    const pay = Math.min(line, cash - buffer);
    post(state, {
      source: 'line-repay', memo: 'Repay seasonal line of credit',
      lines: [{ account: '2000', division: 'CORP', amount: pay }, { account: '1000', division: 'CORP', amount: -pay }],
    });
  }
  fin.borrowingBase = borrowingBase(state);
  const limit = Math.min(fin.lineCommitment, fin.borrowingBase);
  fin.lineAvailable = Math.max(0, limit - lineDrawn(state));
  const over = lineDrawn(state) > limit;
  if (over && !fin.overLimit) {
    ctx.inbox({
      kind: 'alert', title: 'Line of credit over limit',
      body: `The seasonal line is drawn to ${formatCents(lineDrawn(state))} against a limit of ${formatCents(limit)} (commitment ${formatCents(fin.lineCommitment)}, borrowing base ${formatCents(fin.borrowingBase)}). The lender is charging a ${LENDING.overLimitPenalty.value}-point penalty rate until we are back inside the limit. Sell inventory, slow capital spending, or ask for a larger commitment.`,
    });
  }
  if (!over && fin.overLimit) ctx.inbox({ kind: 'memo', title: 'Line of credit back within limit', body: 'The penalty rate no longer applies.' });
  fin.overLimit = over;
}
