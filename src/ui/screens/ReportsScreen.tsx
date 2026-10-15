import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DIVISION_LABEL } from '../../data/supply';
import { distributionFor, formatMonth, scorecard, STATUS_LABEL, type AnnualReport, type ScoreMeasure } from '../../engine/index';
import { Panel, Stat } from '../components/Panel';
import { money, num, pct } from '../format';
import { useStore } from '../store';

type View = 'scorecard' | 'report';

export function ReportsScreen() {
  const game = useStore((s) => s.game)!;
  const [view, setView] = useState<View>('scorecard');
  const reports = game.reports;
  const [fy, setFy] = useState<number | null>(reports[reports.length - 1]?.fy ?? null);
  const sel = reports.find((r) => r.fy === fy) ?? reports[reports.length - 1] ?? null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Reports">
        <button role="tab" aria-selected={view === 'scorecard'} className={`btn ${view === 'scorecard' ? 'btn-primary' : ''}`} onClick={() => setView('scorecard')}>Scorecard</button>
        <button role="tab" aria-selected={view === 'report'} className={`btn ${view === 'report' ? 'btn-primary' : ''}`} onClick={() => setView('report')}>Annual reports</button>
        {view === 'report' && reports.length > 0 && (
          <label className="ml-2 text-sm">Fiscal year{' '}
            <select className="input" value={sel?.fy} onChange={(e) => setFy(Number(e.target.value))}>
              {[...reports].reverse().map((r) => <option key={r.fy} value={r.fy}>{r.fy}</option>)}
            </select>
          </label>
        )}
      </div>
      {view === 'scorecard' ? <ScorecardView /> : sel ? <ReportView r={sel} /> : <Panel><p className="text-sm text-stone-500">The first annual report is published when the first fiscal year closes.</p></Panel>}
    </div>
  );
}

function measureValue(m: ScoreMeasure): string {
  switch (m.unit) {
    case 'pct': return pct(m.value, 1);
    case 'years': return `${m.value} yr`;
    case 'number': return num(m.value);
    default: return String(Math.round(m.value));
  }
}

function ScorecardView() {
  const game = useStore((s) => s.game)!;
  const sc = scorecard(game);
  const hist = game.reports.map((r) => ({ fy: String(r.fy), savings: Math.round(r.savingsBeforeTax / 100), equity: Math.round(r.totalEquity / 100), members: r.activeMembers }));
  const tone = sc.grade === 'A' || sc.grade === 'B' ? 'good' : sc.grade === 'F' || sc.grade === 'D' ? 'bad' : 'neutral';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Overall grade" value={sc.grade} sub={`${sc.overall} of 100`} tone={tone} />
        <Stat label="Years in business" value={sc.years} />
        <Stat label="Annual reports" value={game.reports.length} />
        <Stat label="Members" value={num(game.history[game.history.length - 1]?.activeMembers ?? 0)} />
      </div>
      <Panel title="How the co-op measures up">
        <table className="w-full text-sm">
          <caption className="sr-only">Scorecard measures, targets and scores</caption>
          <thead className="text-left text-xs uppercase text-stone-500"><tr><th className="py-1">Measure</th><th className="pr-4 text-right">Now</th><th className="pl-4">Target</th><th className="w-48">Score</th></tr></thead>
          <tbody>
            {sc.measures.map((m) => (
              <tr key={m.key} className="border-t border-stone-100 align-top">
                <td className="py-1.5"><div className="font-medium">{m.label}</div><div className="text-xs text-stone-500">{m.note}</div></td>
                <td className="num pr-4 text-right">{measureValue(m)}</td>
                <td className="pl-4 text-xs text-stone-600">{m.target}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="relative inline-block h-2 w-32 rounded bg-stone-200" aria-hidden>
                      <span className={`absolute left-0 h-2 rounded ${m.score >= 70 ? 'bg-field' : m.score >= 40 ? 'bg-[#b0893e]' : 'bg-rust'}`} style={{ width: `${Math.max(3, m.score)}%` }} />
                    </span>
                    <span className="num w-8 text-right text-xs">{Math.round(m.score)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {hist.length >= 2 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Savings before tax by fiscal year">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hist} margin={{ left: 10, right: 10 }}>
                <CartesianGrid stroke="#e7e2d3" vertical={false} />
                <XAxis dataKey="fy" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => money(v * 100, { compact: true })} width={60} />
                <Tooltip formatter={(v) => money(Number(v) * 100)} />
                <Bar dataKey="savings" name="Savings before tax" fill="#3f5f2a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Member equity at fiscal year end">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={hist} margin={{ left: 10, right: 10 }}>
                <CartesianGrid stroke="#e7e2d3" vertical={false} />
                <XAxis dataKey="fy" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => money(v * 100, { compact: true })} width={60} />
                <Tooltip formatter={(v) => money(Number(v) * 100)} />
                <Line type="monotone" dataKey="equity" name="Member equity" stroke="#3b6e8f" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}
    </div>
  );
}

/** A short letter to members written from the year's numbers. */
function letter(r: AnnualReport, prev: AnnualReport | undefined, paid: number | null): string {
  const parts: string[] = [];
  const margin = r.sales > 0 ? r.savingsBeforeTax / r.sales : 0;
  parts.push(r.savingsBeforeTax >= 0
    ? `Your cooperative earned ${money(r.savingsBeforeTax)} before tax in fiscal ${r.fy}, ${pct(margin, 1)} of sales of ${money(r.sales, { compact: true })}.`
    : `Fiscal ${r.fy} was a hard year: your cooperative lost ${money(-r.savingsBeforeTax)} before tax on sales of ${money(r.sales, { compact: true })}.`);
  if (prev) {
    const d = r.grainBu - prev.grainBu;
    if (prev.grainBu > 0 && Math.abs(d) / prev.grainBu > 0.05) parts.push(`We handled ${num(Math.round(r.grainBu))} bushels of grain, ${d > 0 ? 'up' : 'down'} ${pct(Math.abs(d) / prev.grainBu, 0)} from the year before.`);
  } else parts.push(`We handled ${num(Math.round(r.grainBu))} bushels of grain.`);
  if (paid !== null && paid > 0) parts.push(`The board returned ${money(paid)} to members in cash patronage and equity redemptions.`);
  parts.push(`Member equity stands at ${money(r.totalEquity, { compact: true })}, ${pct(r.ownerEquityPct, 0)} of assets${r.lenderStatus === 'standard' ? ', and we are in good standing with our lender' : `; our lender has us on ${STATUS_LABEL[r.lenderStatus as keyof typeof STATUS_LABEL]?.toLowerCase() ?? r.lenderStatus} status, and restoring that standing is our first priority`}.`);
  parts.push('Thank you for your patronage. This is your cooperative.');
  return parts.join(' ');
}

function ReportView({ r }: { r: AnnualReport }) {
  const game = useStore((s) => s.game)!;
  const prev = game.reports.find((x) => x.fy === r.fy - 1);
  const dist = distributionFor(game, r.fy);
  const paid = dist ? dist.cash + (dist.redemption?.total ?? 0) : null;
  return (
    <article className="panel mx-auto max-w-4xl p-6" aria-labelledby="ar-title">
      <header className="border-b-2 border-ink pb-3 text-center">
        <div className="text-xs uppercase tracking-widest text-stone-500">Annual report to members</div>
        <h2 id="ar-title" className="headline mt-1 text-3xl font-bold">{r.coopName}</h2>
        <div className="text-sm text-stone-600">Fiscal year {r.fy} · closed {formatMonth(r.closedMonth)}</div>
      </header>
      <section className="mt-4">
        <h3 className="headline text-lg font-bold">To our members</h3>
        <p className="mt-1 leading-relaxed">{letter(r, prev, paid)}</p>
        <p className="mt-1 text-sm text-stone-600">— The Board of Directors, {r.chair}, chair</p>
      </section>
      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales" value={money(r.sales, { compact: true })} />
        <Stat label="Savings before tax" value={money(r.savingsBeforeTax, { compact: true })} tone={r.savingsBeforeTax >= 0 ? 'good' : 'bad'} />
        <Stat label="Member equity" value={money(r.totalEquity, { compact: true })} sub={`${pct(r.ownerEquityPct, 0)} of assets`} />
        <Stat label="Members" value={num(r.activeMembers)} sub={`${num(r.activeFarms)} farms do business with us`} />
      </section>
      <section className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="headline font-bold">Results by business</h3>
          <table className="mt-1 w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-500"><tr><th>Division</th><th className="text-right">Sales</th><th className="text-right">Local savings</th></tr></thead>
            <tbody>
              {r.divisions.map((d) => (
                <tr key={d.division} className="border-t border-stone-100"><td className="py-1">{DIVISION_LABEL[d.division]}</td><td className="num text-right">{money(d.sales, { compact: true })}</td><td className={`num text-right ${d.localSavings < 0 ? 'text-rust' : ''}`}>{money(d.localSavings, { compact: true })}</td></tr>
              ))}
              <tr className="border-t border-stone-300 font-semibold"><td className="py-1">Corporate, interest and patronage income</td><td /><td className="num text-right">{money(r.savingsBeforeTax - r.divisions.reduce((a, d) => a + d.localSavings, 0), { compact: true })}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="headline font-bold">Patronage</h3>
          {dist ? (
            <dl className="mt-1 grid grid-cols-2 gap-y-1 text-sm">
              <dt>Cash patronage</dt><dd className="num text-right">{money(dist.cash)}</dd>
              <dt>Retained as qualified equity</dt><dd className="num text-right">{money(dist.qualified)}</dd>
              {dist.nonqualified > 0 && <><dt>Retained as nonqualified equity</dt><dd className="num text-right">{money(dist.nonqualified)}</dd></>}
              <dt>Unallocated reserves</dt><dd className="num text-right">{money(dist.unallocated)}</dd>
              {dist.redemption && <><dt>Equity redeemed</dt><dd className="num text-right">{money(dist.redemption.total)}</dd></>}
              <dt>Income tax</dt><dd className="num text-right">{money(dist.tax)}</dd>
            </dl>
          ) : <p className="mt-1 text-sm text-stone-500">The board votes the patronage distribution three months after year end.</p>}
        </div>
      </section>
      <section className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="headline font-bold">Financial position</h3>
          <dl className="mt-1 grid grid-cols-2 gap-y-1 text-sm">
            <dt>Total assets</dt><dd className="num text-right">{money(r.totalAssets)}</dd>
            <dt>Debt</dt><dd className="num text-right">{money(r.totalDebt)}</dd>
            <dt>Working capital</dt><dd className="num text-right">{money(r.workingCapital)}</dd>
            <dt>Current ratio</dt><dd className="num text-right">{Number.isFinite(r.currentRatio) ? r.currentRatio.toFixed(2) : '—'}</dd>
            <dt>Grain handled</dt><dd className="num text-right">{num(Math.round(r.grainBu))} bu</dd>
            <dt>Locations</dt><dd className="num text-right">{r.facilities}</dd>
          </dl>
        </div>
        <div>
          <h3 className="headline font-bold">Board of directors</h3>
          <ul className="mt-1 columns-2 text-sm">{r.directors.map((d) => <li key={d}>{d}{d === r.chair ? ' (chair)' : ''}</li>)}</ul>
        </div>
      </section>
      {(r.highlights.length > 0 || r.news.length > 0) && (
        <section className="mt-5 grid gap-5 md:grid-cols-2">
          {r.highlights.length > 0 && <div><h3 className="headline font-bold">The year at the co-op</h3><ul className="mt-1 list-disc pl-5 text-sm">{r.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
          {r.news.length > 0 && <div><h3 className="headline font-bold">The year in agriculture</h3><ul className="mt-1 list-disc pl-5 text-sm">{r.news.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
        </section>
      )}
    </article>
  );
}
