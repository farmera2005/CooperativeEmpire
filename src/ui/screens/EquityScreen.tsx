import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { REDEMPTION } from '../../data/finance';
import { DIVISION_LABEL } from '../../data/supply';
import {
  balance, BASES_FOR, equityOverview, expectedRefundRate, fiscalYearOf, formatMonth, MONTH_NAMES, memberStatement, OP_DIVISIONS, poolLabel, previewDistribution, productionDeductionRate,
  validateProposal, type LossTreatment, type PatronageBasis, type PatronageProposal, type PoolSplit, type RedemptionPlan, type RedemptionPolicy,
} from '../../engine/index';
import { Panel, Stat } from '../components/Panel';
import { Term } from '../components/Term';
import { money, num, pct } from '../format';
import { useStore } from '../store';

const BASIS_LABEL: Record<PatronageBasis, string> = { units: 'Bushels', sales: 'Sales dollars', margin: 'Margin dollars' };
const LOSS_LABEL: Record<LossTreatment, string> = {
  absorbUnallocated: 'Absorb in unallocated reserves', carryForward: 'Carry forward against future patronage',
  chargeAllocated: 'Charge against members\' allocated equity', netAgainstPools: 'Net against other pools first',
};
const PLAN_LABEL: Record<RedemptionPlan['kind'], string> = {
  estate: 'Estates', ageOfPatron: 'Age of patron', revolving: 'Revolving (oldest year first)', percentagePool: 'Percentage of all equity', baseCapital: 'Base capital',
};

export function EquityScreen() {
  const game = useStore((s) => s.game)!;
  const ov = useMemo(() => equityOverview(game), [game]);
  const ep = game.coop.equityProgram;
  const unallocated = -balance(game.ledger, '3400');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label={<Term id="allocated-equity">Allocated equity</Term>} value={money(ov.totalAllocated, { compact: true })} sub={`${num(ov.holders)} holders`} />
        <Stat label={<Term id="membership-stock">Membership stock</Term>} value={money(ov.commonStock, { compact: true })} />
        <Stat label={<Term id="unallocated">Unallocated reserves</Term>} value={money(unallocated, { compact: true })} tone={unallocated < 0 ? 'bad' : 'neutral'} />
        <Stat label={<Term id="revolving">Revolving period</Term>} value={`${ov.revolvingPeriod} yr`} sub={`target ${ov.targetPeriod} yr`} tone={ov.revolvingPeriod > ov.targetPeriod ? 'bad' : 'neutral'} />
        <Stat label={<Term id="unfunded-obligation">Unfunded obligation</Term>} value={money(ov.unfunded, { compact: true })} sub={`${pct(ov.inactiveShare, 0)} held by inactive members`} tone={ov.inactiveShare > 0.4 ? 'bad' : 'neutral'} />
        <Stat label="Next redemption budget" value={money(ov.redemptionBudget, { compact: true })} sub={game.coop.finance.status === 'specialCredit' ? 'frozen by the lender' : undefined} />
        <Stat label="Refund members expect" value={pct(expectedRefundRate(game), 1)} sub="of purchases, valuing cash fully and retained equity at 40%; it draws their business" tone={expectedRefundRate(game) > 0 ? 'good' : 'neutral'} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <CyclePanel />
        <VintageChart data={ov.byVintage} />
      </div>
      <ProposalBuilder key={JSON.stringify(ep.proposal)} />
      <div className="grid grid-cols-2 gap-4">
        <RedemptionEditor key={JSON.stringify(ep.redemption)} />
        <MemberStatementPanel />
      </div>
      <HistoryPanel />
    </div>
  );
}

function CyclePanel() {
  const game = useStore((s) => s.game)!;
  const ep = game.coop.equityProgram;
  const r = ep.pending;
  const fye = game.setup.fiscalYearEndMonth;
  return (
    <Panel title="Patronage calendar">
      <p className="text-sm text-stone-600">
        The fiscal year ends in {MONTH_NAMES[fye - 1]}. The audit takes two months; the board votes the patronage plan in force three months after year end, and
        checks go out at the annual meeting the month after. Change the plan below at any time before the vote.
      </p>
      {r ? (
        <>
          <div className="mt-2 text-sm"><b>Fiscal {r.fy}</b>: {r.status === 'audit' ? 'audit fieldwork under way' : 'audit complete — proposal before the board'}; vote in {formatMonth(r.closedMonth + 3)}.</div>
          <table className="data mt-2">
            <thead><tr><th>Division</th><th className="r">Operating savings</th><th className="r">Member share</th><th className="r"><Term id="patronage">Patronage-sourced</Term></th></tr></thead>
            <tbody>
              {r.divisions.filter((d) => d.operating !== 0).map((d) => (
                <tr key={d.division}><td>{DIVISION_LABEL[d.division]}</td><td className="r">{money(d.operating)}</td><td className="r">{pct(d.memberShare, 0)}</td><td className="r">{money(d.patronageSourced)}</td></tr>
              ))}
              <tr><td>Non-patronage (non-member business, interest, other)</td><td></td><td></td><td className="r">{money(r.nonPatronage)}</td></tr>
              <tr className="font-semibold"><td>Savings before tax</td><td></td><td></td><td className="r">{money(r.savingsBeforeTax)}</td></tr>
              <tr><td>Estimated tax accrued at year end</td><td></td><td></td><td className="r">{money(-r.estimatedTax)}</td></tr>
            </tbody>
          </table>
        </>
      ) : ep.approved ? (
        <div className="mt-2 text-sm">Fiscal {ep.approved.fy} patronage approved: {money(ep.approved.cash)} in cash to be paid at the annual meeting.</div>
      ) : (
        <div className="mt-2 text-sm text-stone-500">Nothing pending until the fiscal year closes.</div>
      )}
    </Panel>
  );
}

function VintageChart({ data }: { data: { fy: number; qualified: number; nonqualified: number }[] }) {
  const rows = data.map((d) => ({ fy: String(d.fy), Qualified: d.qualified / 100, Nonqualified: d.nonqualified / 100 }));
  return (
    <Panel title="Allocated equity by vintage">
      {!rows.length ? <p className="text-sm text-stone-500">No allocated equity yet.</p> : (
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
              <XAxis dataKey="fy" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `$${Math.round(v / 1000)}K`} />
              <Tooltip formatter={(v) => `$${Math.round(Number(v)).toLocaleString("en-US")}`} />
              <Legend />
              <Bar dataKey="Qualified" stackId="a" fill="#3f6b3a" />
              <Bar dataKey="Nonqualified" stackId="a" fill="#b0893e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

const pctIn = (v: number) => Math.round(v * 1000) / 10;

function SplitEditor({ split, onChange }: { split: PoolSplit; onChange: (s: PoolSplit) => void }) {
  const field = (k: keyof PoolSplit, label: string) => (
    <label className="flex items-center gap-1 text-sm">
      {label}
      <input className="input w-16 text-right" type="number" min={0} max={100} step={5} value={pctIn(split[k])}
        onChange={(e) => onChange({ ...split, [k]: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })} />%
    </label>
  );
  return (
    <div className="flex flex-wrap gap-3">
      {field('cash', 'Cash')}{field('qualified', 'Qualified retained')}{field('nonqualified', 'Nonqualified')}{field('unallocated', 'Unallocated')}
    </div>
  );
}

function ProposalBuilder() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [p, setP] = useState<PatronageProposal>(() => JSON.parse(JSON.stringify(game.coop.equityProgram.proposal)));
  const errors = validateProposal(p);
  const preview = useMemo(() => (errors.length ? null : previewDistribution(game, p)), [game, p, errors.length]);
  const fy = game.coop.equityProgram.pending?.fy ?? fiscalYearOf(game.clock.monthIndex, game.setup.fiscalYearEndMonth);
  const ded = productionDeductionRate(fy);
  const poolKeys = p.pooling === 'single' ? ['ALL'] : ['ALL', ...OP_DIVISIONS];
  const sm = preview?.summary;
  return (
    <Panel title={<>Patronage plan — <Term id="patronage-refund">proposal builder</Term></>}>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-sm"><Term id="patronage-pool">Pooling</Term>{' '}
            <select className="input" value={p.pooling} onChange={(e) => setP({ ...p, pooling: e.target.value as PatronageProposal['pooling'] })}>
              <option value="byDivision">One pool per division</option>
              <option value="single">A single pool for all business</option>
            </select>
          </label>
          <table className="data">
            <thead><tr><th>Division</th><th>Allocation basis</th>{p.pooling === 'byDivision' && <th>Own split</th>}</tr></thead>
            <tbody>
              {OP_DIVISIONS.map((d) => (
                <tr key={d}>
                  <td>{DIVISION_LABEL[d]}</td>
                  <td>
                    <select className="input py-0" value={p.basis[d]} onChange={(e) => setP({ ...p, basis: { ...p.basis, [d]: e.target.value as PatronageBasis } })}>
                      {BASES_FOR[d].map((b) => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
                    </select>
                  </td>
                  {p.pooling === 'byDivision' && (
                    <td><input type="checkbox" checked={!!p.pools[d]} onChange={(e) => {
                      const pools = { ...p.pools };
                      if (e.target.checked) pools[d] = { ...p.pools.ALL };
                      else delete pools[d];
                      setP({ ...p, pools });
                    }} /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {poolKeys.filter((k) => p.pools[k]).map((k) => (
            <div key={k}>
              <div className="text-sm font-semibold">{k === 'ALL' && p.pooling === 'byDivision' ? 'Default split (divisions without their own)' : poolLabel(k)}</div>
              <SplitEditor split={p.pools[k]} onChange={(s) => setP({ ...p, pools: { ...p.pools, [k]: s } })} />
            </div>
          ))}
          <label className="block text-sm">If a pool loses money:{' '}
            <select className="input" value={p.lossTreatment} onChange={(e) => setP({ ...p, lossTreatment: e.target.value as LossTreatment })}>
              {(Object.keys(LOSS_LABEL) as LossTreatment[]).filter((k) => k !== 'netAgainstPools' || p.pooling === 'byDivision').map((k) => <option key={k} value={k}>{LOSS_LABEL[k]}</option>)}
            </select>
          </label>
          {ded.pct > 0 && (
            <label className="block text-sm"><Term id="dpad">{ded.label}</Term> passed to members: {Math.round(p.passDeduction * 100)}%
              <input className="ml-2 align-middle" type="range" min={0} max={1} step={0.05} value={p.passDeduction} onChange={(e) => setP({ ...p, passDeduction: Number(e.target.value) })} />
            </label>
          )}
          {errors.length > 0 && <ul className="list-disc pl-5 text-sm text-rust">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={errors.length > 0} onClick={() => command({ type: 'setPatronageProposal', proposal: p })}>Put this plan before the board</button>
            <button className="btn" onClick={() => setP(JSON.parse(JSON.stringify(game.coop.equityProgram.proposal)))}>Reset</button>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold">Preview</div>
          {!game.coop.equityProgram.pending ? (
            <p className="text-sm text-stone-500">The preview uses the closed fiscal year's results; it is available from year end until the board votes.</p>
          ) : !sm ? <p className="text-sm text-stone-500">Fix the plan to see a preview.</p> : (
            <table className="data">
              <tbody>
                <tr><td>Patronage-sourced savings</td><td className="r">{money(sm.patronageSourced)}</td></tr>
                <tr><td>Cash patronage</td><td className="r">{money(sm.cash)}</td></tr>
                <tr><td>Qualified retained</td><td className="r">{money(sm.qualified)}</td></tr>
                <tr><td>Nonqualified retained</td><td className="r">{money(sm.nonqualified)}</td></tr>
                <tr><td>Unallocated (incl. non-patronage)</td><td className="r">{money(sm.unallocated)}</td></tr>
                {sm.loss > 0 && <tr><td>Loss ({LOSS_LABEL[sm.lossTreatment].toLowerCase()})</td><td className="r">{money(sm.loss)}</td></tr>}
                {sm.carryforwardUsed > 0 && <tr><td>Prior losses recovered first</td><td className="r">{money(sm.carryforwardUsed)}</td></tr>}
                <tr><td><Term id="subchapter-t">Income tax</Term> (taxable {money(sm.taxable)})</td><td className="r">{money(sm.tax)}</td></tr>
                {sm.deduction > 0 && <tr><td>{ded.label}: {money(sm.deduction)}, passed through</td><td className="r">{money(sm.deductionPassed)}</td></tr>}
                {sm.nolUsed > 0 && <tr><td><Term id="nol">Loss carryforward</Term> used</td><td className="r">{money(sm.nolUsed)}</td></tr>}
                <tr className="font-semibold"><td>Total cash out (patronage + tax)</td><td className="r">{money(preview!.cashOut)}</td></tr>
                <tr><td>Members receiving patronage</td><td className="r">{num(sm.patrons)}</td></tr>
                <tr className={sm.taxOverCheck > 0 ? 'text-rust' : ''}><td>Members whose tax exceeds their check</td><td className="r">{num(sm.taxOverCheck)}</td></tr>
                <tr className={preview!.equityRatioAfter < preview!.covenantMin ? 'text-rust' : ''}><td><Term id="owner-equity">Owner equity</Term> after (covenant ≥ {pct(preview!.covenantMin, 0)})</td><td className="r">{pct(preview!.equityRatioAfter)}</td></tr>
                {sm.restricted && <tr className="text-rust"><td colSpan={2}>Special credit: the lender limits cash to the legal minimum.</td></tr>}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-stone-500">More cash pleases members (especially those facing a tax bill on their allocation) but drains working capital. Nonqualified and unallocated retains are taxed at the co-op now. Board votes arrive in a later version; for now the board adopts the plan in force.</p>
        </div>
      </div>
    </Panel>
  );
}

function RedemptionEditor() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [pol, setPol] = useState<RedemptionPolicy>(() => JSON.parse(JSON.stringify(game.coop.equityProgram.redemption)));
  const [add, setAdd] = useState<RedemptionPlan['kind']>('percentagePool');
  const move = (i: number, d: number) => {
    const plans = [...pol.plans];
    const j = i + d;
    if (j < 0 || j >= plans.length) return;
    [plans[i], plans[j]] = [plans[j], plans[i]];
    setPol({ ...pol, plans });
  };
  const setPlan = (i: number, plan: RedemptionPlan) => setPol({ ...pol, plans: pol.plans.map((x, k) => (k === i ? plan : x)) });
  const newPlan = (k: RedemptionPlan['kind']): RedemptionPlan =>
    k === 'estate' ? { kind: 'estate', discountPct: 0 } : k === 'ageOfPatron' ? { kind: 'ageOfPatron', age: REDEMPTION.defaultAge } : { kind: k } as RedemptionPlan;
  return (
    <Panel title="Equity redemption program">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        Annual budget: $<input className="input w-28" value={Math.round(pol.budgetFixed / 100)} onChange={(e) => setPol({ ...pol, budgetFixed: Number(e.target.value.replace(/[^\d]/g, '') || 0) * 100 })} />
        plus <input className="input w-16 text-right" type="number" min={0} max={100} step={5} value={pctIn(pol.budgetPctOfSavings)} onChange={(e) => setPol({ ...pol, budgetPctOfSavings: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })} />% of last year's net savings
      </div>
      <ol className="mt-3 space-y-1 text-sm">
        {pol.plans.map((plan, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-4 text-stone-500">{i + 1}.</span>
            <span className="w-56">{plan.kind === 'estate' ? <Term id="estate-redemption">{PLAN_LABEL[plan.kind]}</Term> : plan.kind === 'baseCapital' ? <Term id="base-capital">{PLAN_LABEL[plan.kind]}</Term> : plan.kind === 'revolving' ? <Term id="revolving">{PLAN_LABEL[plan.kind]}</Term> : PLAN_LABEL[plan.kind]}</span>
            {plan.kind === 'ageOfPatron' && <label>age ≥ <input className="input w-14" type="number" min={60} max={80} value={plan.age} onChange={(e) => setPlan(i, { ...plan, age: Number(e.target.value) })} /></label>}
            {plan.kind === 'estate' && <label>discount <input className="input w-14" type="number" min={0} max={50} value={pctIn(plan.discountPct)} onChange={(e) => setPlan(i, { ...plan, discountPct: Number(e.target.value) / 100 })} />%</label>}
            <span className="ml-auto flex gap-1">
              <button className="btn py-0" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button className="btn py-0" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button className="btn py-0" onClick={() => setPol({ ...pol, plans: pol.plans.filter((_, k) => k !== i) })} aria-label="Remove">✕</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <select className="input" value={add} onChange={(e) => setAdd(e.target.value as RedemptionPlan['kind'])}>
          {(Object.keys(PLAN_LABEL) as RedemptionPlan['kind'][]).filter((k) => !pol.plans.some((p) => p.kind === k)).map((k) => <option key={k} value={k}>{PLAN_LABEL[k]}</option>)}
        </select>
        <button className="btn" onClick={() => !pol.plans.some((p) => p.kind === add) && setPol({ ...pol, plans: [...pol.plans, newPlan(add)] })}>Add plan</button>
        <button className="btn btn-primary ml-auto" onClick={() => command({ type: 'setRedemptionPolicy', policy: pol })}>Adopt program</button>
      </div>
      <p className="mt-2 text-xs text-stone-500">Plans spend the budget in order at the annual meeting. Nonqualified equity redeemed is deductible that year. Redemptions stop under special credit, and the board won't borrow more than half the line's headroom to pay them.</p>
    </Panel>
  );
}

function MemberStatementPanel() {
  const game = useStore((s) => s.game)!;
  const [q, setQ] = useState('');
  const [id, setId] = useState<number | null>(null);
  const matches = q.length >= 2 ? game.members.list.filter((m) => m.kind === 'member' && m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const top = useMemo(() => {
    if (q) return [];
    return Object.keys(game.equity.allocated).map(Number).map((mid) => memberStatement(game, mid)!).filter(Boolean).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [game, q]);
  const st = id !== null ? memberStatement(game, id) : null;
  return (
    <Panel title="Member patronage statements">
      <input className="input w-full" placeholder="Search members by name" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-1 flex flex-wrap gap-1 text-sm">
        {(matches.length ? matches.map((m) => ({ id: m.id, name: m.name })) : top.map((t) => ({ id: t.member.id, name: t.member.name }))).map((m) => (
          <button key={m.id} className={`btn py-0 ${id === m.id ? 'btn-primary' : ''}`} onClick={() => setId(m.id)}>{m.name}</button>
        ))}
      </div>
      {st && (
        <div className="mt-2 text-sm">
          <div><b>{st.member.name}</b> — {st.member.status}, born {st.member.birthYear}, {game.world.towns[st.member.townId].name}. Stock {money(st.stock)}; allocated equity {money(st.total)}.</div>
          <table className="data mt-1">
            <thead><tr><th>Vintage</th><th className="r">Qualified</th><th className="r">Nonqualified</th></tr></thead>
            <tbody>{st.vintages.map((v) => <tr key={v.fy}><td>FY{v.fy}</td><td className="r">{money(v.qualified)}</td><td className="r">{money(v.nonqualified)}</td></tr>)}</tbody>
          </table>
          {st.patronage.length > 0 && <div className="mt-1 text-xs text-stone-500">Patronage allocated: {st.patronage.map((p) => `FY${p.fy} ${money(p.cents)}`).join(' · ')}</div>}
        </div>
      )}
    </Panel>
  );
}

function HistoryPanel() {
  const game = useStore((s) => s.game)!;
  const h = [...game.coop.equityProgram.history].reverse();
  return (
    <Panel title="Distribution history">
      {!h.length ? <p className="text-sm text-stone-500">No distributions yet.</p> : (
        <table className="data">
          <thead><tr><th>Year</th><th className="r">Savings before tax</th><th className="r">Patronage-sourced</th><th className="r">Cash</th><th className="r">Qualified</th><th className="r">Nonqualified</th><th className="r">Unallocated</th><th className="r">Tax</th><th className="r">Redeemed</th><th className="r">Tax &gt; check</th></tr></thead>
          <tbody>
            {h.map((x) => (
              <tr key={x.fy}><td>FY{x.fy}</td><td className="r">{money(x.savingsBeforeTax)}</td><td className="r">{money(x.patronageSourced)}</td><td className="r">{money(x.cash)}</td><td className="r">{money(x.qualified)}</td><td className="r">{money(x.nonqualified)}</td><td className="r">{money(x.unallocated)}</td><td className="r">{money(x.tax)}</td><td className="r">{x.redemption ? money(x.redemption.total) : '—'}</td><td className="r">{num(x.taxOverCheck)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
