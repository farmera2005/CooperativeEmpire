import { useMemo, useState } from 'react';
import {
  ACCOUNT_BY_ID, ACCOUNTS, balanceSheet, cashFlow, DIVISIONS, fiscalYearOf, fiscalYearStart, formatMonth, formatMonthShort, incomeStatement,
  type DivisionId, type IncomeStatement, type JournalEntry,
} from '../../engine/index';
import { Panel } from '../components/Panel';
import { balanceSheetRating, budgetVsActual, ratios } from '../../engine/index';
import { BreakdownView } from '../components/BreakdownView';
import { Term } from '../components/Term';
import { money } from '../format';
import { useStore } from '../store';

type Period = 'month' | 'fytd' | 'lastfy' | 'all';

export function FinancialsScreen() {
  const game = useStore((s) => s.game)!;
  const [period, setPeriod] = useState<Period>('fytd');
  const [drill, setDrill] = useState<string | null>(null);
  const [allocate, setAllocate] = useState(false);
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
        <label className="ml-auto text-sm"><input type="checkbox" checked={allocate} onChange={(e) => setAllocate(e.target.checked)} /> Allocate corporate overhead to divisions (by gross revenue)</label>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title={<>Income statement <span className="normal-case">(<Term id="net-savings">net savings</Term>)</span></>}>
          <table className="data">
            <thead><tr><th></th>{divs.map((d) => <th key={d} className="r">{d}</th>)}<th className="r">Consolidated</th></tr></thead>
            <tbody>
              {allocate && (() => {
                const corp = byDiv.find((s) => s.division === 'CORP');
                const pool = corp ? corp.totalOpex + corp.interestNet - corp.grossRevenue : 0;
                const ops = byDiv.filter((s) => s.division !== 'CORP');
                const base = ops.reduce((a, s) => a + Math.max(0, s.grossRevenue), 0);
                const share = (s: IncomeStatement) => (s.division === 'CORP' ? -pool : base > 0 ? (pool * Math.max(0, s.grossRevenue)) / base : 0);
                return (
                  <>
                    <tr className="bg-[#f6f1e2]"><td>Allocated corporate overhead</td>{byDiv.map((s) => <td key={s.division} className="r">{money(-Math.round(share(s)))}</td>)}<td className="r">—</td></tr>
                    <tr className="bg-[#f6f1e2] font-semibold"><td>Local savings after allocation</td>{byDiv.map((s) => <td key={s.division} className="r">{money(Math.round(s.localSavings - share(s)))}</td>)}<td className="r">{money(cons.localSavings)}</td></tr>
                  </>
                );
              })()}
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
              {([['Current assets', bs.currentAssets], ['Investments in other cooperatives', bs.investments], ['Property & equipment', bs.fixedAssets], ['Goodwill', bs.intangibles]] as const).map(([h, lines]) => (
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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RatingPanel />
        <RatiosPanel />
        <BudgetPanel />
      </div>
      <p className="text-xs text-stone-500">Chart of accounts: {ACCOUNTS.length} accounts, posted by division ({DIVISIONS.join(', ')}).</p>
    </div>
  );
}

function BsSection({ title, lines, onDrill }: { title: string; lines: { account: string; name: string; amount: number }[]; onDrill: (a: string) => void }) {
  return (
    <>
      <tr><td colSpan={2} className="pt-2 text-xs font-semibold uppercase text-stone-500">{title}</td></tr>
      {lines.length === 0 && <tr><td className="pl-4 text-stone-500">—</td><td></td></tr>}
      {lines.map((l) => (
        <tr key={l.account}><td className="pl-4"><button className="text-left hover:underline" onClick={() => onDrill(l.account)}>{l.name}</button></td><td className="r">{money(l.amount)}</td></tr>
      ))}
    </>
  );
}

export type { DivisionId };

/** The balance sheet rating and what drives it (D-118). */
function RatingPanel() {
  const game = useStore((s) => s.game)!;
  const r = balanceSheetRating(game);
  const tone = ['AAA', 'AA', 'A', 'BBB'].includes(r.grade) ? 'text-field' : ['BB', 'B'].includes(r.grade) ? 'text-grain' : 'text-rust';
  return (
    <Panel title={<Term id="bs-rating">Balance sheet rating</Term>}>
      <div className="flex items-baseline gap-3">
        <span className={`text-4xl font-bold ${tone}`}>{r.grade}</span>
        <span className="text-sm text-stone-600">score {Math.round(r.score)} of 100{r.uncapped ? ` (the ratios alone earn ${r.uncapped}; the lender's standing caps it)` : ''}</span>
      </div>
      <div className="mt-2"><BreakdownView b={r.why} /></div>
      <p className="mt-2 text-xs text-stone-500">BBB or better is a sound credit. Equity weighs most; liquidity and debt service next. The grade cannot rise above BB while the lender has us on watch.</p>
    </Panel>
  );
}

function RatiosPanel() {
  const game = useStore((s) => s.game)!;
  const r = ratios(game);
  const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const rows: [string, string, string][] = [
    ['Working capital', money(r.workingCapital), 'Current assets minus current liabilities'],
    ['Current ratio', f(r.currentRatio), 'Lenders like 1.2 or better'],
    ['Owner equity %', `${(r.ownerEquityPct * 100).toFixed(1)}%`, '40–50% is healthy; lenders get nervous well before 30%'],
    ['Local leverage', f(r.localLeverage), 'Liabilities ÷ equity excluding investments in other co-ops'],
    ['Term debt ÷ net fixed assets', `${(r.termDebtToNetFixed * 100).toFixed(0)}%`, ''],
    ['Debt service coverage', f(r.debtServiceCoverage), 'Trailing 12 months; below 1.25 worries the lender'],
    ['Return on local equity', `${(r.returnOnLocalEquity * 100).toFixed(1)}%`, 'Trailing 12 months local savings'],
  ];
  return (
    <Panel title="Ratios">
      <table className="data"><tbody>{rows.map(([a, b, c]) => <tr key={a}><td>{a}</td><td className="r">{b}</td><td className="text-xs text-stone-500">{c}</td></tr>)}</tbody></table>
    </Panel>
  );
}

function BudgetPanel() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const cmp = budgetVsActual(game);
  const b = game.coop.budget;
  const [sg, setSg] = useState(String(b?.salesGrowthPct ?? ''));
  const [cg, setCg] = useState(String(b?.costGrowthPct ?? ''));
  const [cap, setCap] = useState(String(Math.round((b?.capex ?? 0) / 100)));
  const fy = fiscalYearOf(game.clock.monthIndex, game.setup.fiscalYearEndMonth);
  const draft = b && b.fy > fy;
  return (
    <Panel title={cmp ? `Budget vs actual, fiscal ${cmp.fy} (${cmp.elapsedMonths} of 12 months)` : 'Budget'}>
      {cmp ? (
        <table className="data">
          <thead><tr><th>Division</th><th className="r">Sales budget</th><th className="r">Sales to date</th><th className="r">Local savings budget</th><th className="r">To date</th></tr></thead>
          <tbody>
            {cmp.rows.filter((r) => r.budget.sales || r.actual.sales || r.budget.opex || r.actual.opex).map((r) => (
              <tr key={r.division}><td>{r.division}</td><td className="r">{money(r.budget.sales)}</td><td className="r">{money(r.actual.sales)}</td><td className="r">{money(r.budget.localSavings)}</td>
                <td className={`r ${r.actual.localSavings < (r.budget.localSavings * cmp.elapsedMonths) / 12 ? 'text-rust' : ''}`}>{money(r.actual.localSavings)}</td></tr>
            ))}
            <tr className="font-semibold"><td>Capital spending</td><td className="r">{money(cmp.capex)}</td><td className="r">{money(cmp.capexSpent)}</td><td colSpan={2}></td></tr>
          </tbody>
        </table>
      ) : <p className="text-sm text-stone-500">No approved budget for this fiscal year. The CFO drafts next year's budget three months before year end.</p>}
      {b && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <b>{draft ? `Fiscal ${b.fy} budget (${b.approved ? 'approved' : 'draft'})` : `Fiscal ${b.fy} capital budget`}:</b>
          {draft && !b.approved && <>
            sales growth <input className="input w-16" aria-label="Budget sales growth, percent" value={sg} onChange={(e) => setSg(e.target.value)} />%
            cost growth <input className="input w-16" aria-label="Budget cost growth, percent" value={cg} onChange={(e) => setCg(e.target.value)} />%
          </>}
          capital $<input className="input w-28" aria-label="Capital budget, dollars" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ''))} />
          <button className="btn" onClick={() => command({ type: 'setBudget', ...(draft && !b.approved ? { salesGrowthPct: Number(sg), costGrowthPct: Number(cg) } : {}), capex: Number(cap) * 100 })}>Update</button>
        </div>
      )}
    </Panel>
  );
}
