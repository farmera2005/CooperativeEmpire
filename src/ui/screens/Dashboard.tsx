import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MARKET_SERIES, type SeriesId } from '../../data/markets';
import { COMMODITIES } from '../../data/grain';
import { balanceSheet, fiscalYearOf, fiscalYearStart, formatMonthShort, incomeStatement, ratios, type GameState } from '../../engine/index';
import { Panel, Stat } from '../components/Panel';
import { Term } from '../components/Term';
import { money, num, pct } from '../format';
import { useStore } from '../store';

const KEY_SERIES: SeriesId[] = ['corn', 'soybeans', 'wheat', 'diesel', 'propane', 'anhydrous', 'prime'];

export function Dashboard() {
  const game = useStore((s) => s.game)!;
  const summaries = useStore((s) => s.summaries);
  const setTab = useStore((s) => s.setTab);
  const mi = game.clock.monthIndex;
  const fye = game.setup.fiscalYearEndMonth;
  const fyStart = Math.max(fiscalYearStart(fiscalYearOf(mi, fye), fye), game.ledger.firstMonth);
  const ytd = incomeStatement(game.ledger, fyStart, mi);
  const bs = balanceSheet(game.ledger, mi);
  const last = game.history[game.history.length - 1];
  const first = game.history[0];
  const equityPct = bs.totalAssets ? bs.totalEquity / bs.totalAssets : 0;
  const chart = game.history.filter((_, i, a) => a.length < 240 || i % 3 === 0).map((h) => ({
    m: formatMonthShort(h.monthIndex), cash: h.cash / 100, equity: h.equity / 100, members: h.activeMembers,
  }));
  const news = [...game.inbox].reverse().slice(0, 6);
  const alerts = alertsFor(game);
  const grainYtd = incomeStatement(game.ledger, fyStart, mi, 'GRAIN');
  const rt = ratios(game);
  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div className="space-y-1">
          {alerts.map((a) => (
            <div key={a.text} className={`rounded border px-3 py-1.5 text-sm ${a.level === 'bad' ? 'border-rust bg-[#f8e6df] text-rust' : 'border-grain bg-[#faf3dc]'}`}>
              {a.text} {a.tab && <button className="ml-2 underline" onClick={() => setTab(a.tab!)}>Go</button>}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total assets" value={money(bs.totalAssets, { compact: true })} />
        <Stat label="Member equity" value={money(bs.totalEquity, { compact: true })} sub={<><Term id="owner-equity">Owner equity</Term> {pct(equityPct, 0)}</>} />
        <Stat label={<><Term id="net-savings">Net savings</Term>, FYTD</>} value={money(ytd.netSavings, { compact: true })} tone={ytd.netSavings >= 0 ? 'good' : 'bad'} />
        <Stat label="Active members" value={num(last.activeMembers)} sub={`${num(first.activeMembers)} at founding`} />
        <Stat label="Farms in territory" value={num(last.activeFarms)} sub={`avg ${num(last.totalAcres / Math.max(1, last.activeFarms))} acres`} />
        <Stat label="Member satisfaction" value={num(last.avgSatisfaction)} sub="0–100" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Grain margin + services, FYTD" value={money(grainYtd.grossRevenue, { compact: true })} sub={`${num(game.history.slice(-12).reduce((a, h) => a + h.grainBu, 0))} bu received, last 12 mo`} />
        <Stat label="Grain share of territory" value={`${(last.grainShare * 100).toFixed(1)}%`} sub="this month" />
        <Stat label="Working capital" value={money(rt.workingCapital, { compact: true })} tone={rt.workingCapital < 0 ? 'bad' : 'neutral'} sub={`current ratio ${Number.isFinite(rt.currentRatio) ? rt.currentRatio.toFixed(2) : '—'}`} />
        <Stat label="Term debt" value={money(rt.termDebt, { compact: true })} sub={`${(rt.termDebtToNetFixed * 100).toFixed(0)}% of net fixed assets`} />
        <Stat label="Line of credit" value={money(last.lineDrawn, { compact: true })} sub={`available ${money(game.coop.finance.lineAvailable, { compact: true })}`} tone={game.coop.finance.overLimit ? 'bad' : 'neutral'} />
        <Stat label="Facilities" value={num(game.coop.facilities.filter((f) => f.status !== 'closed').length)} sub={`${game.coop.projects.length} project(s) under way`} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Markets this month" className="xl:col-span-1" right={<button className="text-xs text-sky underline" onClick={() => setTab('markets')}>All markets</button>}>
          <table className="data">
            <thead><tr><th>Market</th><th className="r">Price</th><th className="r">Chg</th></tr></thead>
            <tbody>
              {KEY_SERIES.map((id) => {
                const d = MARKET_SERIES[id];
                const v = game.markets.current[id];
                const p = game.markets.previous[id];
                if (v === undefined) return null;
                const ch = p ? v / p - 1 : 0;
                return (
                  <tr key={id}>
                    <td>{d.label} <span className="text-xs text-stone-500">{d.unit}</span></td>
                    <td className="r">{d.kind === 'rate' ? `${v.toFixed(2)}%` : v.toFixed(d.decimals > 2 ? 2 : d.decimals)}</td>
                    <td className={`r ${ch > 0.001 ? 'text-field' : ch < -0.001 ? 'text-rust' : ''}`}>{d.kind === 'rate' ? (v - (p ?? v)).toFixed(2) : pct(ch)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="Cash and member equity" className="xl:col-span-2">
          <div style={{ height: 230 }}>
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid stroke="#e7e2d3" />
                <XAxis dataKey="m" fontSize={11} minTickGap={40} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `$${Math.round(v / 1000)}K`} />
                <Tooltip formatter={(v) => `$${Math.round(Number(v)).toLocaleString()}`} />
                <Line type="monotone" dataKey="cash" stroke="#3b6e8f" dot={false} name="Cash" />
                <Line type="monotone" dataKey="equity" stroke="#3f5f2a" dot={false} name="Equity" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Latest news and memos" right={<button className="text-xs text-sky underline" onClick={() => setTab('inbox')}>Inbox</button>}>
          <ul className="space-y-1 text-sm">
            {news.map((n) => (
              <li key={n.id} className={n.read ? 'text-stone-600' : 'font-semibold'}>
                <span className="mr-2 text-xs text-stone-500">{formatMonthShort(n.monthIndex)}</span>
                <span className={n.kind === 'history' ? 'headline' : ''}>{n.title}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recent months">
          {summaries.length === 0 ? <p className="text-sm text-stone-500">End the month to see results here.</p> : (
            <ul className="space-y-1 text-sm">
              {summaries.slice(0, 8).map((s) => (
                <li key={s.monthIndex}>{s.lines[0]} <span className={s.netSavings >= 0 ? 'text-field' : 'text-rust'}>Net savings {money(s.netSavings)}.</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="text-xs text-stone-500">
        Milestone 2: grain is the only business so far. Agronomy, feed, energy and retail arrive in Milestone 3; patronage,
        taxes and the full lender relationship in Milestone 4.
      </p>
    </div>
  );
}

interface Alert {
  level: 'bad' | 'warn';
  text: string;
  tab?: 'grain' | 'financials' | 'inbox';
}

function alertsFor(game: GameState): Alert[] {
  const out: Alert[] = [];
  const fin = game.coop.finance;
  const g = game.coop.grain;
  if (fin.overLimit) out.push({ level: 'bad', text: 'The seasonal line is over its limit; the lender is charging a penalty rate.', tab: 'financials' });
  else if (fin.lineAvailable < fin.lineCommitment * 0.1 && fin.lineCommitment > 0 && game.coop.facilities.length) out.push({ level: 'warn', text: 'Less than 10% of the seasonal line is left.', tab: 'financials' });
  if (g.report && g.report.marginCall > 0) out.push({ level: 'warn', text: `Margin call: deposited ${money(g.report.marginCall)} with the futures broker this month.`, tab: 'grain' });
  for (const c of COMMODITIES) if (g.report?.byCommodity[c].overLimit) out.push({ level: 'bad', text: `${c} net open position is over the board's limit.`, tab: 'grain' });
  if (g.report && g.report.maxWaitHours > 2) out.push({ level: 'warn', text: `Harvest lines: trucks waited up to ${g.report.maxWaitHours.toFixed(1)} hours this month.`, tab: 'grain' });
  const turned = g.report ? COMMODITIES.reduce((a, c) => a + g.report!.byCommodity[c].turnedAwayBu, 0) : 0;
  if (turned > 0) out.push({ level: 'bad', text: `${Math.round(turned).toLocaleString()} bu were turned away for lack of space or capacity.`, tab: 'grain' });
  for (const f of game.coop.facilities) if (f.status === 'operating' && f.condition < 35) out.push({ level: 'warn', text: `${f.name} is in poor condition (${Math.round(f.condition)}/100); breakdowns and repair bills will rise.`, tab: 'grain' });
  if (!game.coop.facilities.length && game.coop.offers.length) out.push({ level: 'warn', text: `${game.coop.offers.length} elevator(s) are for sale. The co-op has no facility yet.`, tab: 'grain' });
  return out;
}
