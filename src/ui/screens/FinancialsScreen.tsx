import { useMemo, useState } from 'react';
import {
  ACCOUNT_BY_ID, ACCOUNTS, balanceSheet, cashFlow, DIVISIONS, fiscalYearOf, fiscalYearStart, formatMonth, formatMonthShort, incomeStatement,
  type DivisionId, type IncomeStatement, type JournalEntry,
} from '../../engine/index';
import { Panel } from '../components/Panel';
import { Term } from '../components/Term';
import { money } from '../format';
import { useStore } from '../store';

type Period = 'month' | 'fytd' | 'lastfy' | 'all';

export function FinancialsScreen() {
  const game = useStore((s) => s.game)!;
  const [period, setPeriod] = useState<Period>('fytd');
  const [drill, setDrill] = useState<string | null>(null);
  const mi = game.clock.monthIndex;
  const fye = game.setup.fiscalYearEndMonth;
  const fy = fiscalYearOf(mi, fye);
  const first = game.ledger.firstMonth;
  const [from, to] = useMemo((): [number, number] => {
    switch (period) {
      case 'month': return [mi, mi];
      case 'fytd': return [Math.max(first, fiscalYearStart(fy, fye)), mi];
      case 'lastfy': return [Math.max(first, fiscalYearStart(fy - 1, fye)), Math.max(first, fiscalYearStart(fy, fye) - 1)];
      case 'all': return [first, mi];
    }
  }, [period, mi, fy, fye, first]);
  const divs = DIVISIONS.filter((d) => Object.keys(game.ledger.balances).some((k) => k.endsWith(`|${d}`)));
  const cons = incomeStatement(game.ledger, from, to);
  const byDiv = divs.map((d) => incomeStatement(game.ledger, from, to, d));
  const bs = balanceSheet(game.ledger, to);
  const cf = cashFlow(game.ledger, from, to);

  const isRows: [string, (s: IncomeStatement) => number, boolean?, string?][] = [
    ['Sales', (s) => s.sales, false, '4000'], ['Cost of goods sold', (s) => -s.cogs, false, '5000'], ['Gross margin', (s) => s.grossMargin, true],
    ['Service & other income', (s) => s.serviceIncome, false, '6000'], ['Gross revenue', (s) => s.grossRevenue, true],
    ['Personnel', (s) => -s.opex.personnel, false, '7000'], ['Depreciation', (s) => -s.opex.depreciation, false, '7100'], ['Repairs', (s) => -s.opex.repairs, false, '7200'],
    ['Insurance', (s) => -s.opex.insurance, false, '7300'], ['Utilities', (s) => -s.opex.utilities, false, '7400'], ['Bad debt', (s) => -s.opex.badDebt, false, '7500'],
    ['Other operating expense', (s) => -s.opex.otherOpex, false, '7620'], ['Total operating expense', (s) => -s.totalOpex, true],
    ['Interest, net', (s) => -s.interestNet, false, '8000'], ['Local savings', (s) => s.localSavings, true],
    ['Patronage from regionals & lender', (s) => s.patronageIncome, false, '8100'], ['Other income', (s) => s.otherIncome, false, '8200'],
    ['Savings before tax', (s) => s.savingsBeforeTax, true], ['Income tax', (s) => -s.tax, false, '9000'], ['Net savings', (s) => s.netSavings, true],
  ];

  const entries = useMemo(() => {
    if (!drill) return [] as JournalEntry[];
    const out: JournalEntry[] = [];
    for (const m of game.ledger.months) {
      if (m.monthIndex < from || m.monthIndex > to || !m.entries) continue;
      for (const e of m.entries) if (e.lines.some((l) => l.account === drill || (ACCOUNT_BY_ID[drill]?.isGroup && ACCOUNT_BY_ID[l.account]?.isGroup === ACCOUNT_BY_ID[drill].isGroup))) out.push(e);
    }
    return out.reverse().slice(0, 300);
  }, [drill, game.ledger.months, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['month', 'This month'], ['fytd', `Fiscal ${fy} to date`], ['lastfy', `Fiscal ${fy - 1}`], ['all', 'Since founding']] as [Period, string][]).map(([p, l]) => (
          <button key={p} className={`btn ${period === p ? 'btn-primary' : ''}`} onClick={() => setPeriod(p)}>{l}</button>
        ))}
        <span className="text-sm text-stone-500">{formatMonth(from)} – {formatMonth(to)}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title={<>Income statement <span className="normal-case">(<Term id="net-savings">net savings</Term>)</span></>}>
          <table className="data">
            <thead><tr><th></th>{divs.map((d) => <th key={d} className="r">{d}</th>)}<th className="r">Consolidated</th></tr></thead>
            <tbody>
              {isRows.map(([label, f, bold, acct]) => (
                <tr key={label} className={bold ? 'font-semibold' : ''}>
                  <td>{acct ? <button className="text-left hover:underline" onClick={() => setDrill(acct)}>{label}</button> : label}</td>
                  {byDiv.map((s) => <td key={s.division} className="r">{money(f(s))}</td>)}
                  <td className="r">{money(f(cons))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title={`Balance sheet, ${formatMonth(to)}`}>
          <table className="data">
            <tbody>
              {([['Current assets', bs.currentAssets], ['Investments in other cooperatives', bs.investments], ['Property & equipment', bs.fixedAssets]] as const).map(([h, lines]) => (
                <BsSection key={h} title={h} lines={lines} onDrill={setDrill} />
              ))}
              <tr className="font-semibold"><td>Total assets</td><td className="r">{money(bs.totalAssets)}</td></tr>
              <BsSection title="Current liabilities" lines={bs.currentLiabilities} onDrill={setDrill} />
              <BsSection title="Long-term liabilities" lines={bs.longTermLiabilities} onDrill={setDrill} />
              <tr className="font-semibold"><td>Total liabilities</td><td className="r">{money(bs.totalLiabilities)}</td></tr>
              <BsSection title="Member equity" lines={bs.memberEquity} onDrill={setDrill} />
              <tr><td className="pl-4">Current year net savings (not yet distributed)</td><td className="r">{money(bs.currentYearSavings)}</td></tr>
              <tr className="font-semibold"><td>Total equity</td><td className="r">{money(bs.totalEquity)}</td></tr>
              <tr className="font-semibold"><td>Total liabilities & equity</td><td className="r">{money(bs.totalLiabilities + bs.totalEquity)}</td></tr>
            </tbody>
          </table>
        </Panel>
        <Panel title="Statement of cash flows">
          <table className="data">
            <tbody>
              <tr><td>Net savings</td><td className="r">{money(cf.netSavings)}</td></tr>
              {cf.operating.map((l) => <tr key={l.account}><td className="pl-4">Change in {l.name.toLowerCase()}</td><td className="r">{money(l.amount)}</td></tr>)}
              <tr className="font-semibold"><td>Cash from operations</td><td className="r">{money(cf.netOperating)}</td></tr>
              {cf.investing.map((l) => <tr key={l.account}><td className="pl-4">{l.name}</td><td className="r">{money(l.amount)}</td></tr>)}
              <tr className="font-semibold"><td>Cash from investing</td><td className="r">{money(cf.netInvesting)}</td></tr>
              {cf.financing.map((l) => <tr key={l.account}><td className="pl-4">{l.name}</td><td className="r">{money(l.amount)}</td></tr>)}
              <tr className="font-semibold"><td>Cash from financing</td><td className="r">{money(cf.netFinancing)}</td></tr>
              <tr><td>Beginning cash</td><td className="r">{money(cf.beginningCash)}</td></tr>
              <tr className="font-semibold"><td>Ending cash</td><td className="r">{money(cf.endingCash)}</td></tr>
            </tbody>
          </table>
        </Panel>
        <Panel title={drill ? `Journal entries: ${drill} ${ACCOUNT_BY_ID[drill]?.name ?? ''}` : 'Journal drill-down'} right={drill && <button className="text-xs underline" onClick={() => setDrill(null)}>clear</button>}>
          {!drill ? <p className="text-sm text-stone-500">Click a statement line to see the journal entries behind it. Detail is kept for the current and two prior fiscal years.</p> : (
            <div className="max-h-96 overflow-auto">
              <table className="data">
                <thead><tr><th>Month</th><th>#</th><th>Memo</th><th>Account</th><th>Div</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
                <tbody>
                  {entries.flatMap((e) => e.lines.map((l, i) => (
                    <tr key={`${e.id}-${i}`} className={i === 0 ? 'border-t-2 border-stone-300' : ''}>
                      <td>{i === 0 ? formatMonthShort(e.monthIndex) : ''}</td><td>{i === 0 ? e.id : ''}</td><td>{i === 0 ? e.memo : ''}</td>
                      <td>{l.account} {ACCOUNT_BY_ID[l.account]?.name}</td><td>{l.division}</td>
                      <td className="r">{l.amount > 0 ? money(l.amount) : ''}</td><td className="r">{l.amount < 0 ? money(-l.amount) : ''}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <p className="text-xs text-stone-500">Chart of accounts: {ACCOUNTS.length} accounts, posted by division ({DIVISIONS.join(', ')}).</p>
    </div>
  );
}

function BsSection({ title, lines, onDrill }: { title: string; lines: { account: string; name: string; amount: number }[]; onDrill: (a: string) => void }) {
  return (
    <>
      <tr><td colSpan={2} className="pt-2 text-xs font-semibold uppercase text-stone-500">{title}</td></tr>
      {lines.length === 0 && <tr><td className="pl-4 text-stone-400">—</td><td></td></tr>}
      {lines.map((l) => (
        <tr key={l.account}><td className="pl-4"><button className="text-left hover:underline" onClick={() => onDrill(l.account)}>{l.name}</button></td><td className="r">{money(l.amount)}</td></tr>
      ))}
    </>
  );
}

export type { DivisionId };
