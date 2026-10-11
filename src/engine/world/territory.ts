// Procedural trade territory (DESIGN §6.2). Deterministic from the map seed.

import { brandsAvailable } from '../../data/brands';
import { COUNTY_NAMES, TOWN_FOUNDERS, TOWN_PREFIXES, TOWN_SUFFIXES } from '../../data/names';
import type { RegionDef } from '../../data/regions/eccb';
import { TERRITORY } from '../../data/tuning';
import { clamp } from '../core/math';
import { stream, type Rng } from '../core/rng';
import type { County, Destination, District, RailLine, Road, Town, WorldState } from '../types';

export type Territory = Omit<WorldState, 'weather'>;

function townName(rng: Rng, used: Set<string>): string {
  for (let tries = 0; tries < 200; tries++) {
    const r = rng.next();
    let name: string;
    if (r < 0.45) name = rng.pick(TOWN_PREFIXES) + rng.pick(TOWN_SUFFIXES);
    else if (r < 0.8) name = rng.pick(TOWN_FOUNDERS) + rng.pick(TOWN_SUFFIXES.filter((x) => !x.startsWith(' ') || x === ' City' || x === ' Junction'));
    else name = `${rng.pick(TOWN_PREFIXES)} ${rng.pick(['Grove', 'Hill', 'Prairie', 'Creek', 'Springs', 'Point'])}`;
    name = name.replace(/\s+/g, ' ').trim();
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Station ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

const logUniform = (rng: Rng, lo: number, hi: number) => Math.exp(rng.range(Math.log(lo), Math.log(hi)));

export function generateTerritory(mapSeed: number, region: RegionDef, startYear: number, members: number): Territory {
  const rng = stream(mapSeed, -1, 'territory');
  const T = TERRITORY;
  const nTowns = clamp(Math.round(T.townsBase + T.townsSpan * Math.sqrt(members / 5000)) + rng.int(-2, 2), region.towns.min, region.towns.max);
  const nCounties = clamp(Math.round(nTowns / T.townsPerCounty.value), region.counties.min, region.counties.max);
  // Keep the map roughly square: two rows from three counties up.
  const rows = nCounties >= 3 ? 2 : 1;
  const cols = Math.ceil(nCounties / rows);
  const cm = region.countyMiles.value;
  const width = cols * cm;
  const height = rows * cm;

  // Counties: fill grid cells; for odd counts with 2 rows, skip one corner cell.
  const cells: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
  if (cells.length > nCounties) cells.splice(rng.pick([0, cols - 1, cells.length - cols, cells.length - 1]), cells.length - nCounties);
  const countyNames = rng.shuffle([...COUNTY_NAMES]);
  const counties: County[] = cells.map(([c, r], i) => ({
    id: i, name: countyNames[i], x0: c * cm, y0: r * cm, x1: (c + 1) * cm, y1: (r + 1) * cm, seatTownId: -1,
  }));

  // Towns.
  const used = new Set<string>();
  const towns: Town[] = [];
  const spacing = T.minTownSpacingMiles.value;
  const farEnough = (x: number, y: number, minD: number) => towns.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= minD * minD);
  for (const c of counties) {
    const cx = (c.x0 + c.x1) / 2 + rng.range(-4, 4);
    const cy = (c.y0 + c.y1) / 2 + rng.range(-4, 4);
    const [lo, hi] = T.countySeatPop.value;
    towns.push({ id: towns.length, name: townName(rng, used), countyId: c.id, x: cx, y: cy, population: Math.round(logUniform(rng, lo, hi) / 10) * 10, isCountySeat: true, onHighway: false, railLineIds: [], districtId: 0 });
    c.seatTownId = towns.length - 1;
  }
  let guard = 0;
  while (towns.length < nTowns && guard++ < 20000) {
    const c = counties[towns.length % counties.length];
    const x = rng.range(c.x0 + 1, c.x1 - 1);
    const y = rng.range(c.y0 + 1, c.y1 - 1);
    const minD = guard > 10000 ? spacing * 0.7 : spacing;
    if (!farEnough(x, y, minD)) continue;
    const [lo, hi] = T.townPop.value;
    const pop = Math.round(Math.exp(rng.range(Math.log(lo), Math.log(hi)) * 0.85 + Math.log(lo) * 0.15) / 10) * 10;
    towns.push({ id: towns.length, name: townName(rng, used), countyId: c.id, x, y, population: pop, isCountySeat: false, onHighway: false, railLineIds: [], districtId: 0 });
  }

  // Roads: Gabriel graph.
  const n = towns.length;
  const d2 = (i: number, j: number) => (towns[i].x - towns[j].x) ** 2 + (towns[i].y - towns[j].y) ** 2;
  const roads: Road[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mx = (towns[i].x + towns[j].x) / 2;
      const my = (towns[i].y + towns[j].y) / 2;
      const r2 = d2(i, j) / 4;
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        if (k === i || k === j) continue;
        if ((towns[k].x - mx) ** 2 + (towns[k].y - my) ** 2 < r2) ok = false;
      }
      if (ok) roads.push({ a: i, b: j, miles: Math.round(Math.sqrt(d2(i, j)) * T.roadCircuity.value * 10) / 10, major: false });
    }
  }

  // Shortest paths (Floyd–Warshall) with next-hop for highway marking.
  const INF = 1e9;
  const dist: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : INF)));
  const next = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? j : -1)));
  for (const r of roads) {
    dist[r.a][r.b] = dist[r.b][r.a] = r.miles;
    next[r.a][r.b] = r.b;
    next[r.b][r.a] = r.a;
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
          next[i][j] = next[i][k];
        }
      }
    }
  }
  const pathBetween = (a: number, b: number) => {
    const p = [a];
    let cur = a;
    while (cur !== b && next[cur][b] >= 0 && p.length <= n) {
      cur = next[cur][b];
      p.push(cur);
    }
    return p;
  };

  // Major highways: between the most distant pairs of towns near opposite edges.
  const edgeTowns = [...towns].sort((p, q) => p.x - q.x);
  const pairs: [number, number][] = [
    [edgeTowns[0].id, edgeTowns[n - 1].id],
    [[...towns].sort((p, q) => p.y - q.y)[0].id, [...towns].sort((p, q) => q.y - p.y)[0].id],
  ];
  for (const [a, b] of pairs.slice(0, T.majorHighways)) {
    const p = pathBetween(a, b);
    for (let i = 0; i < p.length - 1; i++) {
      const r = roads.find((rd) => (rd.a === p[i] && rd.b === p[i + 1]) || (rd.b === p[i] && rd.a === p[i + 1]));
      if (r) r.major = true;
      towns[p[i]].onHighway = true;
      towns[p[i + 1]].onHighway = true;
    }
  }

  // Rail.
  const railroads = brandsAvailable('railroad', startYear, region.id).filter((b) => b.classI && b.regions?.includes(region.id));
  const rail: RailLine[] = [];
  const cxm = width / 2;
  const cym = height / 2;
  const theta = rng.range(0, Math.PI);
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  let capture = T.mainlineCaptureMiles;
  let mainTowns: Town[] = [];
  const off = rng.range(-height / 6, height / 6);
  while (mainTowns.length < 3 && capture < 20) {
    mainTowns = towns.filter((t) => Math.abs(-(t.x - cxm) * dy + (t.y - cym) * dx - off) < capture);
    capture += 1;
  }
  mainTowns.sort((p, q) => (p.x - cxm) * dx + (p.y - cym) * dy - ((q.x - cxm) * dx + (q.y - cym) * dy));
  const ext = Math.max(width, height);
  const mainOwner = railroads.length ? rng.pick(railroads) : undefined;
  const mainPath: [number, number][] = [
    [cxm - dx * ext - dy * off, cym - dy * ext + dx * off],
    ...mainTowns.map((t) => [t.x, t.y] as [number, number]),
    [cxm + dx * ext - dy * off, cym + dy * ext + dx * off],
  ];
  rail.push({ id: 0, name: 'Main line', ownerBrandId: mainOwner?.id ?? 'rr-shortline', kind: 'mainline', townIds: mainTowns.map((t) => t.id), path: mainPath, abandonmentRisk: 0, status: 'active' });
  for (const t of mainTowns) t.railLineIds.push(0);

  const nBranches = rng.int(T.branchLines[0], T.branchLines[1]);
  for (let bi = 0; bi < nBranches && mainTowns.length; bi++) {
    const junction = rng.pick(mainTowns);
    const ang = theta + Math.PI / 2 + (rng.chance(0.5) ? 0 : Math.PI) + rng.range(-0.5, 0.5);
    const bx = Math.cos(ang);
    const by = Math.sin(ang);
    const chain: Town[] = [junction];
    const want = rng.int(T.branchTowns[0], T.branchTowns[1]);
    for (let k = 0; k < want; k++) {
      const last = chain[chain.length - 1];
      const cand = towns
        .filter((t) => !chain.includes(t) && t.railLineIds.length === 0)
        .map((t) => ({ t, proj: (t.x - last.x) * bx + (t.y - last.y) * by, d: Math.hypot(t.x - last.x, t.y - last.y) }))
        .filter((c) => c.proj > 2 && c.d < 16)
        .sort((p, q) => p.d - q.d);
      if (!cand.length) break;
      chain.push(cand[0].t);
    }
    if (chain.length < 2) continue;
    const id = rail.length;
    const owner = railroads.length ? rng.pick(railroads) : undefined;
    const [rlo, rhi] = T.branchAbandonmentRisk.value;
    rail.push({
      id, name: `${chain[chain.length - 1].name} Branch`, ownerBrandId: owner?.id ?? 'rr-shortline', kind: 'branch',
      townIds: chain.map((t) => t.id), path: chain.map((t) => [t.x, t.y] as [number, number]), abandonmentRisk: Math.round(rng.range(rlo, rhi) * 1000) / 1000, status: 'active',
    });
    for (const t of chain) if (!t.railLineIds.includes(id)) t.railLineIds.push(id);
  }

  // Off-map destinations.
  const destinations: Destination[] = [];
  const offMap = (miles: number): [number, number] => {
    const side = rng.int(0, 3);
    if (side === 0) return [-miles * 0.3, rng.range(0, height)];
    if (side === 1) return [width + miles * 0.3, rng.range(0, height)];
    if (side === 2) return [rng.range(0, width), -miles * 0.3];
    return [rng.range(0, width), height + miles * 0.3];
  };
  if (rng.chance(region.riverTerminalProb.value)) {
    const miles = Math.round(rng.range(...T.riverTerminalMiles.value));
    const [x, y] = offMap(miles);
    destinations.push({ id: destinations.length, name: 'River terminal', kind: 'riverTerminal', x, y, milesFromEdge: miles });
  }
  {
    const miles = Math.round(rng.range(...T.processorMiles.value));
    const [x, y] = offMap(miles);
    destinations.push({ id: destinations.length, name: 'Soybean processor', kind: 'processor', x, y, milesFromEdge: miles });
  }
  {
    const miles = Math.round(rng.range(...T.processorMiles.value));
    const [x, y] = offMap(miles);
    destinations.push({ id: destinations.length, name: 'Corn processor', kind: 'processor', x, y, milesFromEdge: miles });
  }

  const territory: Territory = {
    regionId: region.id, width, height, counties, towns, roads, rail, destinations, districts: [],
    distances: dist.map((row) => row.map((v) => Math.round(v * 10) / 10)),
  };
  return territory;
}

/** Weight used both for spreading farms across towns and for balancing districts. */
export const townFarmWeight = (t: Town): number => 1 + Math.min(t.population, 5000) / 2000;

/** Split towns into k contiguous-ish districts by angle around the centroid, balanced by weight. */
export function makeDistricts(territory: Territory, k: number, weightOf: (t: Town) => number): District[] {
  const cx = territory.width / 2;
  const cy = territory.height / 2;
  const sorted = [...territory.towns].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const total = sorted.reduce((s, t) => s + weightOf(t), 0);
  const districts: District[] = Array.from({ length: k }, (_, i) => ({ id: i, name: `District ${i + 1}`, townIds: [] }));
  let acc = 0;
  for (const t of sorted) {
    const idx = Math.min(k - 1, Math.floor((acc / total) * k));
    districts[idx].townIds.push(t.id);
    t.districtId = idx;
    acc += weightOf(t);
  }
  return districts;
}
