import { useMemo, useState } from 'react';
import { totalAcres, yearOf, type Member } from '../../engine/index';
import { Panel } from '../components/Panel';
import { Term } from '../components/Term';
import { money, num } from '../format';
import { useStore } from '../store';

const PAGE = 50;
type SortKey = 'name' | 'age' | 'acres' | 'town' | 'satisfaction' | 'stock';

export function MembersScreen() {
  const game = useStore((s) => s.game)!;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'member' | 'nonmember' | 'all'>('member');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [sort, setSort] = useState<SortKey>('acres');
  const [page, setPage] = useState(0);
  const year = yearOf(game.clock.monthIndex);
  const towns = game.world.towns;
  const stock = game.equity.commonStock;
  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    const list = game.members.list.filter((m) =>
      (kind === 'all' || m.kind === kind)
      && (status === 'all' || (status === 'active' ? m.status === 'active' : m.status !== 'active'))
      && (!ql || m.name.toLowerCase().includes(ql) || towns[m.townId].name.toLowerCase().includes(ql)));
    const val = (m: Member): number | string => {
      switch (sort) {
        case 'name': return m.name.split(' ').slice(-1)[0] + m.name;
        case 'age': return year - m.birthYear;
        case 'acres': return totalAcres(m);
        case 'town': return towns[m.townId].name;
        case 'satisfaction': return m.satisfaction;
        case 'stock': return stock[m.id] ?? 0;
      }
    };
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return typeof x === 'string' ? x.localeCompare(y as string) : (y as number) - x;
    });
  }, [game.members.list, q, kind, status, sort, towns, year, stock]);

  const segments = useMemo(() => {
    const active = game.members.list.filter((m) => m.status === 'active' && m.kind === 'member');
    const by = (key: (m: Member) => string) => {
      const out: Record<string, { n: number; acres: number; sat: number }> = {};
      for (const m of active) {
        const k = key(m);
        out[k] ??= { n: 0, acres: 0, sat: 0 };
        out[k].n += 1;
        out[k].acres += totalAcres(m);
        out[k].sat += m.satisfaction;
      }
      return out;
    };
    return { district: by((m) => game.world.districts[m.districtId]?.name ?? '?'), size: by((m) => m.sizeClass) };
  }, [game.members.list, game.world.districts]);

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const th = (k: SortKey, label: string, right = false) => (
    <th className={`${right ? 'r' : ''} cursor-pointer`} onClick={() => setSort(k)}>{label}{sort === k ? ' ▾' : ''}</th>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(['district', 'size'] as const).map((seg) => (
          <Panel key={seg} title={seg === 'district' ? 'Active members by district' : 'Active members by farm size'}>
            <table className="data">
              <thead><tr><th>{seg === 'district' ? 'District' : 'Size class'}</th><th className="r">Members</th><th className="r">Acres</th><th className="r">Avg acres</th><th className="r">Satisfaction</th></tr></thead>
              <tbody>
                {Object.entries(segments[seg]).sort().map(([k, v]) => (
                  <tr key={k}><td className="capitalize">{k}</td><td className="r">{num(v.n)}</td><td className="r">{num(v.acres)}</td><td className="r">{num(v.acres / v.n)}</td><td className="r">{num(v.sat / v.n)}</td></tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))}
      </div>
      <Panel title={`${num(rows.length)} records`} right={
        <div className="flex gap-2">
          <input className="input" placeholder="Search name or town" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          <select className="input" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setPage(0); }}>
            <option value="member">Members</option><option value="nonmember">Non-member customers</option><option value="all">All</option>
          </select>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}>
            <option value="active">Active</option><option value="inactive">Retired / deceased</option><option value="all">All</option>
          </select>
        </div>
      }>
        <div className="max-h-[60vh] overflow-auto">
          <table className="data">
            <thead>
              <tr>
                {th('name', 'Name')}{th('town', 'Town')}<th>District</th>{th('age', 'Age', true)}{th('acres', 'Acres', true)}
                <th className="r">Corn</th><th className="r">Soy</th><th className="r">Wheat</th><th>Livestock</th><th>Size</th>
                {th('satisfaction', 'Satisf.', true)}{th('stock', 'Stock', true)}<th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}{m.isDirector && <span className="ml-1 rounded bg-grain px-1 text-xs text-white" title="Director">D</span>}</td>
                  <td>{towns[m.townId].name}</td>
                  <td>{game.world.districts[m.districtId]?.name}</td>
                  <td className="r">{m.status === 'active' ? year - m.birthYear : '—'}</td>
                  <td className="r">{num(totalAcres(m))}</td>
                  <td className="r">{num(m.acres.corn)}</td><td className="r">{num(m.acres.soybeans)}</td><td className="r">{num(m.acres.wheat)}</td>
                  <td className="text-xs">{Object.entries(m.livestock).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${num(v)}`).join(', ')}</td>
                  <td className="capitalize">{m.sizeClass}</td>
                  <td className="r">{num(m.satisfaction)}</td>
                  <td className="r">{money(stock[m.id] ?? 0)}</td>
                  <td className="capitalize">{m.kind === 'nonmember' ? 'customer' : m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
          <span>Page {page + 1} of {Math.max(1, Math.ceil(rows.length / PAGE))}</span>
          <button className="btn" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</button>
          <span className="ml-auto text-xs text-stone-500"><Term id="membership-stock">Membership stock</Term> is shown per member. One member, one vote.</span>
        </div>
      </Panel>
    </div>
  );
}
