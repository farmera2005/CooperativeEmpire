import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, newGame } from '../sim/newGame';
import { cloneState } from '../sim/clone';
import { post, LedgerError, closeFiscalYear, balance } from './ledger';
import { balanceSheet, cashFlow, incomeStatement } from './statements';
import { checkInvariants } from './invariants';

const base = () => newGame({ ...DEFAULT_SETUP, startingMembers: 60, gameSeed: 7, mapSeed: 7 });

describe('ledger', () => {
  it('rejects unbalanced and fractional entries', () => {
    const s = cloneState(base());
    expect(() => post(s, { source: 't', memo: '', lines: [{ account: '1000', division: 'CORP', amount: 5 }] })).toThrow(LedgerError);
    expect(() => post(s, { source: 't', memo: '', lines: [{ account: '1000', division: 'CORP', amount: 0.5 }, { account: '3000', division: 'CORP', amount: -0.5 }] })).toThrow(LedgerError);
    expect(() => post(s, { source: 't', memo: '', lines: [{ account: '9999', division: 'CORP', amount: 5 }, { account: '3000', division: 'CORP', amount: -5 }] })).toThrow(LedgerError);
  });

  it('keeps A = L + E and reconciles cash flow through operations and closing', () => {
    const s = cloneState(base());
    post(s, { source: 't', memo: 'sale', lines: [{ account: '1100', division: 'GRAIN', amount: 50000 }, { account: '4000', division: 'GRAIN', amount: -50000 }] });
    post(s, { source: 't', memo: 'cogs', lines: [{ account: '5000', division: 'GRAIN', amount: 30000 }, { account: '1000', division: 'GRAIN', amount: -30000 }] });
    post(s, { source: 't', memo: 'loan', lines: [{ account: '1000', division: 'CORP', amount: 100000 }, { account: '2300', division: 'CORP', amount: -100000 }] });
    expect(checkInvariants(s)).toEqual([]);
    const is = incomeStatement(s.ledger, s.clock.monthIndex, s.clock.monthIndex, 'GRAIN');
    expect(is.sales).toBe(50000);
    expect(is.grossMargin).toBe(20000);
    const cf = cashFlow(s.ledger, s.clock.monthIndex, s.clock.monthIndex);
    expect(cf.netChange).toBe(balance(s.ledger, '1000'));
    const savings = closeFiscalYear(s, '3400');
    expect(checkInvariants(s)).toEqual([]);
    const bs = balanceSheet(s.ledger, s.clock.monthIndex);
    expect(bs.currentYearSavings).toBe(0);
    expect(bs.memberEquity.find((l) => l.account === '3400')?.amount).toBe(savings);
  });

  it('ties the equity subledger to the GL', () => {
    const s = cloneState(base());
    expect(checkInvariants(s)).toEqual([]);
    const id = Number(Object.keys(s.equity.commonStock)[0]);
    s.equity.commonStock[id] += 1;
    expect(checkInvariants(s).some((e) => e.includes('3000'))).toBe(true);
  });
});
