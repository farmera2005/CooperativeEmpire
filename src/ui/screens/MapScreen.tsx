import { useMemo, useState } from 'react';
import { brandName, getBrand } from '../../data/brands';
import { totalAcres, type Town } from '../../engine/index';
import { Panel } from '../components/Panel';
import { TerritoryMap, type TownOverlay } from '../components/TerritoryMap';
import { num } from '../format';
import { useStore } from '../store';

export function MapScreen() {
  const game = useStore((s) => s.game)!;
  const [mode, setMode] = useState<'districts' | 'members'>('members');
  const [sel, setSel] = useState<Town | null>(null);
  const world = game.world;
  const stats = useMemo(() => {
    const by: Record<number, { members: number; nonmembers: number; acres: number }> = {};
    for (const t of world.towns) by[t.id] = { members: 0, nonmembers: 0, acres: 0 };
    for (const m of game.members.list) {
      if (m.status !== 'active') continue;
      const b = by[m.townId];
      if (m.kind === 'member') b.members += m.weight;
      else b.nonmembers += m.weight;
      b.acres += totalAcres(m) * m.weight;
    }
    return by;
  }, [game.members.list, world.towns]);
  const maxMembers = Math.max(1, ...Object.values(stats).map((s) => s.members));
  const overlay: Record<number, TownOverlay> | undefined = mode === 'members'
    ? Object.fromEntries(world.towns.map((t) => [t.id, { intensity: stats[t.id].members / maxMembers, label: `${stats[t.id].members} members, ${stats[t.id].nonmembers} non-member customers` }]))
    : undefined;
  const fz = game.setup.fictionalizeBrands;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
      <div className="xl:col-span-3">
        <div className="mb-2 flex gap-2 text-sm">
          <button className={`btn ${mode === 'members' ? 'btn-primary' : ''}`} onClick={() => setMode('members')}>Members by town</button>
          <button className={`btn ${mode === 'districts' ? 'btn-primary' : ''}`} onClick={() => setMode('districts')}>Board districts</button>
        </div>
        <TerritoryMap world={world} homeTownId={game.coop.homeTownId} overlay={overlay} showDistricts={mode === 'districts'} fictionalize={fz} height={640} onSelectTown={setSel} selectedTownId={sel?.id} />
      </div>
      <div className="space-y-4">
        <Panel title={sel ? sel.name : 'Town details'}>
          {sel ? (
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="text-stone-500">County</dt><dd>{world.counties[sel.countyId].name}</dd>
              <dt className="text-stone-500">District</dt><dd>{world.districts[sel.districtId]?.name}</dd>
              <dt className="text-stone-500">Population</dt><dd className="num">{num(sel.population)}</dd>
              <dt className="text-stone-500">Highway</dt><dd>{sel.onHighway ? 'Yes' : 'No'}</dd>
              <dt className="text-stone-500">Rail</dt><dd>{sel.railLineIds.map((id) => world.rail[id].kind === 'mainline' ? 'Main line' : 'Branch').join(', ') || 'None'}</dd>
              <dt className="text-stone-500">Members</dt><dd className="num">{stats[sel.id].members}</dd>
              <dt className="text-stone-500">Non-member customers</dt><dd className="num">{stats[sel.id].nonmembers}</dd>
              <dt className="text-stone-500">Farm acres</dt><dd className="num">{num(stats[sel.id].acres)}</dd>
            </dl>
          ) : <p className="text-sm text-stone-500">Click a town.</p>}
        </Panel>
        <Panel title="Rail lines">
          <ul className="space-y-1 text-sm">
            {world.rail.map((r) => (
              <li key={r.id}>
                <b>{r.kind === 'mainline' ? 'Main line' : r.name}</b> — {getBrand(r.ownerBrandId) ? brandName(r.ownerBrandId, fz) : 'short line'}
                {r.kind === 'branch' && <span className="text-xs text-stone-500"> · abandonment risk {(r.abandonmentRisk * 100).toFixed(1)}%/yr after deregulation</span>}
                <div className="text-xs text-stone-500">{r.townIds.map((id) => world.towns[id].name).join(' – ')}</div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Markets beyond the map">
          <ul className="text-sm">
            {world.destinations.map((d) => <li key={d.id}>{d.name}: {d.milesFromEdge} miles from the edge of the territory</li>)}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
