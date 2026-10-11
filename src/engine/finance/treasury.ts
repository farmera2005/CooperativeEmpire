// Treasury sweep (DESIGN §12, simplified until M4): cover negative cash by drawing the
// seasonal line; repay the line from cash above a buffer; accrue line interest monthly.

import { LENDING } from '../../data/tuning';
import { roundCents } from '../core/money';
import { balance, post } from '../ledger/ledger';
import type { TickContext } from '../sim/context';
import { nominalCents } from '../world/macro';
import { marketValue } from '../world/marketPath';

export function lenderRate(ctx: TickContext): number {
  const spread = LENDING.spreadOverPrime[ctx.state.coop.lenderId]?.value ?? LENDING.spreadOverPrime['local-bank'].value;
  return marketValue(ctx.path, 'prime', ctx.mi) + spread;
}

export function stepTreasury(ctx: TickContext): void {
  const { state } = ctx;
  const drawn = -balance(state.ledger, '2000');
  if (drawn > 0) {
    const interest = roundCents((drawn * lenderRate(ctx)) / 100 / 12);
    post(state, {
      source: 'line-interest', memo: 'Interest on seasonal line of credit',
      lines: [{ account: '8000', division: 'CORP', amount: interest }, { account: '1000', division: 'CORP', amount: -interest }],
    });
  }
  const cash = balance(state.ledger, '1000');
  const buffer = nominalCents(ctx.path, ctx.mi, LENDING.cashBuffer.value);
  const line = -balance(state.ledger, '2000');
  if (cash < 0) {
    const draw = -cash;
    post(state, {
      source: 'line-draw', memo: 'Draw on seasonal line of credit',
      lines: [{ account: '1000', division: 'CORP', amount: draw }, { account: '2000', division: 'CORP', amount: -draw }],
    });
  } else if (line > 0 && cash > buffer) {
    const pay = Math.min(line, cash - buffer);
    post(state, {
      source: 'line-repay', memo: 'Repay seasonal line of credit',
      lines: [{ account: '2000', division: 'CORP', amount: pay }, { account: '1000', division: 'CORP', amount: -pay }],
    });
  }
}
