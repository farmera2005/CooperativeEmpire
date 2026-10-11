// Corporate overhead posted monthly: GM pay, office, board meetings, audit, interest on cash.

import { OVERHEAD } from '../../data/tuning';
import { fiscalPeriod } from '../core/calendar';
import { roundCents } from '../core/money';
import { balance, post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import { marketValue } from '../world/marketPath';
import { nominalCents } from '../world/macro';

export function postOverhead(ctx: TickContext): void {
  const { state, path, mi } = ctx;
  const members = state.members.list.filter((m) => m.kind === 'member' && m.status === 'active').length;
  const gmAnnual2024 = OVERHEAD.gmSalaryBase.value + OVERHEAD.gmSalaryPerMember.value * members;
  const salary = nominalCents(path, mi, gmAnnual2024 / 12);
  const benefits = roundCents(salary * OVERHEAD.benefitsRate.value);
  const office = nominalCents(path, mi, OVERHEAD.officeMonthlyBase.value + OVERHEAD.officeMonthlyPerMember.value * members);
  const board = nominalCents(path, mi, OVERHEAD.directorPerDiem.value * state.governance.directors.length);
  const lines = [
    { account: '7000', division: 'CORP' as const, amount: salary },
    { account: '7010', division: 'CORP' as const, amount: benefits },
    { account: '7620', division: 'CORP' as const, amount: office },
    { account: '7610', division: 'CORP' as const, amount: board },
  ];
  // Annual audit fee, billed the third month after fiscal year end.
  if (fiscalPeriod(mi, state.setup.fiscalYearEndMonth) === 3 && mi - state.coop.foundedMonth > 3) {
    lines.push({ account: '7600', division: 'CORP', amount: nominalCents(path, mi, OVERHEAD.auditFeeBase.value) });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  post(state, { source: 'overhead', memo: 'Corporate payroll, office, board and professional fees', lines: [...lines, { account: '1000', division: 'CORP', amount: -total }] });

  // Interest earned on positive cash balances.
  const cash = balance(state.ledger, '1000');
  if (cash > 0) {
    const rate = Math.max(0, marketValue(path, 'tbill', mi) - OVERHEAD.cashYieldSpread.value) / 100;
    const interest = roundCents((cash * rate) / 12);
    if (interest > 0) {
      post(state, {
        source: 'cash-interest', memo: 'Interest earned on cash balances',
        lines: [{ account: '1000', division: 'CORP', amount: interest }, { account: '8050', division: 'CORP', amount: -interest }],
      });
    }
  }
}
