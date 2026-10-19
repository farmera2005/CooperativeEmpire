// New game setup and the founding sequence (DESIGN §3).

import { emptyTech } from '../world/tech';
import { emptyRegulation } from '../world/regulation';
import { brandsAvailable, getBrand } from '../../data/brands';
import { COOP_NAME_PATTERNS } from '../../data/names';
import { REGIONS } from '../../data/regions/eccb';
import { GOVERNANCE_SETUP, LENDING, SETUP } from '../../data/tuning';
import { MARKETPLACE } from '../../data/grain';
import { formatCents } from '../core/format';
import { defaultCommitment, emptyFinance } from '../finance/lender';
import { emptyEquityProgram, emptyRegional } from '../finance/defaults';
import { defaultAffiliations } from '../finance/regionals';
import { emptyPeople } from '../people/leaders';
import { ensureHomeIndependent, generateCompetitors, generateOffers, generateSupplyCompetitors } from '../competitors/competitors';
import { defaultSupplyPolicies, emptyPatronageStats, emptySupply } from '../supply/defaults';
import { defaultGrainPolicy, emptyGrainBook } from '../grain/defaults';
import { formatMonth, toMonthIndex } from '../core/calendar';
import { allocateCents, roundCents, type Cents } from '../core/money';
import { stream } from '../core/rng';
import { electFoundingBoard } from '../governance/board';
import { emptyLedger, post } from '../ledger/ledger';
import { generateMembers, totalAcres } from '../members/generate';
import { SCHEMA_VERSION, type GameSetup, type GameState, type Town } from '../types';
import { makeDriftPlan } from '../world/drift';
import { priceLevel } from '../world/macro';
import { getMarketPath } from '../world/marketPath';
import { generateTerritory, makeDistricts, townFarmWeight, type Territory } from '../world/territory';
import { weatherFor } from '../world/weather';
import { snapshot } from './snapshot';
import { refreshMarkets } from './steps';

export const DEFAULT_SETUP: GameSetup = {
  coopName: '',
  startYear: 1970,
  startingMembers: SETUP.defaultMembers,
  capitalPreset: 'typical',
  fiscalYearEndMonth: 8,
  difficulty: 'normal',
  mapSeed: 1,
  gameSeed: 1,
  historyMode: 'drift',
  regionId: 'eccb',
  fictionalizeBrands: false,
  lenderId: 'bc-district',
  regionalAffiliations: [],
};

/** Farm customers in the trade area: as set, or founding members plus the usual share of non-members (D-108). */
export function territoryCustomers(setup: Pick<GameSetup, 'startingMembers' | 'territoryCustomers'>): number {
  const [lo, hi] = SETUP.customersRange;
  const members = Math.round(setup.startingMembers);
  const wanted = setup.territoryCustomers ?? Math.round(members * (1 + SETUP.nonMemberShare.value));
  return Math.max(members, Math.max(lo, Math.min(hi, Math.round(wanted))));
}

/** Territory preview for the setup screen (town names for the name generator, home town). The map is sized to the farms it holds. */
export function previewTerritory(setup: Pick<GameSetup, 'mapSeed' | 'regionId' | 'startYear' | 'startingMembers' | 'territoryCustomers'>): Territory {
  const t = generateTerritory(setup.mapSeed, REGIONS[setup.regionId], setup.startYear, territoryCustomers(setup));
  t.districts = makeDistricts(t, GOVERNANCE_SETUP.districts, townFarmWeight);
  return t;
}

export function defaultHomeTown(t: Territory): Town {
  const cx = t.width / 2;
  const cy = t.height / 2;
  return [...t.towns].sort((a, b) => Number(b.isCountySeat) - Number(a.isCountySeat) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
}

export function suggestCoopNames(t: Territory, year: number, seed: number, count = 5): string[] {
  const rng = stream(seed, -1, 'setup.names', year);
  const patterns = COOP_NAME_PATTERNS.filter((p) => year >= p.from && year < p.to);
  const out = new Set<string>();
  for (let i = 0; i < 50 && out.size < count; i++) {
    const town = rng.weighted(t.towns, (x) => x.population);
    const county = t.counties[town.countyId];
    out.add(rng.pick(patterns).pattern.replace('{town}', town.name).replace('{county}', county.name));
  }
  return [...out];
}

/** Lenders available at founding in the start year. */
export function availableLenders(year: number): { id: string; name: string }[] {
  const coopLender = brandsAvailable('lender', year)[0];
  return [
    ...(coopLender ? [{ id: coopLender.id, name: coopLender.name }] : []),
    { id: 'local-bank', name: 'Local commercial bank' },
  ];
}

export function availableRegionals(year: number, regionId: string) {
  return brandsAvailable('regional', year, regionId);
}

/** Starting capital in nominal cents for the setup. */
export function startingCapital(setup: GameSetup): Cents {
  if (setup.capitalPreset === 'custom' && setup.customCapital !== undefined) return setup.customCapital;
  const preset = setup.capitalPreset === 'custom' ? 'typical' : setup.capitalPreset;
  const path = getMarketPath(setup.gameSeed, setup.historyMode, makeDriftPlan(setup.gameSeed, setup.historyMode));
  const pl = priceLevel(path, toMonthIndex(setup.startYear, 1));
  const d2024 = Math.max(SETUP.minCapital.value, SETUP.capitalPerMember[preset].value * setup.startingMembers);
  return roundCents(d2024 * pl * 100);
}

export function newGame(setupIn: GameSetup): GameState {
  let setup = setupIn;
  const region = REGIONS[setup.regionId];
  if (!region) throw new Error(`Unknown region ${setup.regionId}`);
  const [minM, maxM] = SETUP.membersRange;
  const members = Math.max(minM, Math.min(maxM, Math.round(setup.startingMembers)));
  const startMonth = toMonthIndex(setup.startYear, 1);
  // A co-op bank that no longer exists in the start year is replaced by its successor.
  const lb = getBrand(setup.lenderId);
  if (lb && lb.availableTo !== undefined && setup.startYear >= lb.availableTo && lb.successor) setup = { ...setup, lenderId: lb.successor };
  // A co-op without regional affiliations signs with the usual regionals for its area.
  if (!setup.regionalAffiliations.length) setup = { ...setup, regionalAffiliations: defaultAffiliations(setup.startYear, setup.regionId) };
  const drift = makeDriftPlan(setup.gameSeed, setup.historyMode);

  const territory = previewTerritory({ ...setup, startingMembers: members });
  const homeTown = setup.homeTownId !== undefined ? territory.towns[setup.homeTownId] : defaultHomeTown(territory);
  const customers = territoryCustomers({ ...setup, startingMembers: members });
  const list = generateMembers(setup.gameSeed, territory.towns, region, setup.startYear, startMonth, members, customers);
  const governance = electFoundingBoard(stream(setup.gameSeed, -1, 'governance.founding'), list, territory.districts.length, setup.startYear);
  const name = setup.coopName.trim() || suggestCoopNames(territory, setup.startYear, setup.gameSeed, 1)[0];

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    setup: { ...setup, startingMembers: members, territoryCustomers: customers, coopName: name },
    clock: { monthIndex: startMonth, startMonth, commandsThisMonth: 0 },
    drift,
    world: { ...territory, weather: weatherFor(setup.gameSeed, setup.regionId, startMonth) },
    markets: { current: {}, previous: {} },
    members: { list, nextId: list.length + 1, flow: [] },
    ledger: emptyLedger(startMonth),
    equity: { commonStock: {}, preferredStock: {}, allocated: {} },
    governance,
    coop: {
      name, homeTownId: homeTown.id, foundedMonth: startMonth, lenderId: setup.lenderId,
      regionalAffiliations: setup.regionalAffiliations, minCash: 0,
      facilities: [], projects: [], assets: [], nextId: 1, grainPolicy: defaultGrainPolicy(), grain: emptyGrainBook(), offers: [],
      finance: emptyFinance(), grainStats: { marketBu: 0, offeredBu: 0, priceAdvantage: 0 },
      supply: emptySupply(), supplyPolicy: defaultSupplyPolicies(), patronageStats: emptyPatronageStats(),
      equityProgram: emptyEquityProgram(), regional: emptyRegional(), budget: null,
    },
    people: emptyPeople(),
    deals: [],
    jvs: [],
    integrationUntil: null,
    tech: emptyTech(),
    regulation: emptyRegulation(),
    flags: {},
    eventLog: [],
    reports: [],
    competitors: [],
    inbox: [],
    nextInboxId: 1,
    firedEvents: [],
    history: [],
    outcome: null,
  };
  refreshMarkets(state);

  // Founding capital: member stock subscriptions, in proportion to farm size.
  const capital = startingCapital({ ...setup, startingMembers: members });
  const founders = list.filter((m) => m.kind === 'member');
  const parts = allocateCents(capital, founders.map((m) => totalAcres(m) + 50));
  founders.forEach((m, i) => (state.equity.commonStock[m.id] = parts[i]));
  post(state, {
    source: 'founding', memo: `Member stock subscriptions from ${founders.length} founding members`,
    lines: [{ account: '1000', division: 'CORP', amount: capital }, { account: '3000', division: 'CORP', amount: -capital }],
  });

  // Lender commitment, competitors, and the first facilities offered for sale.
  state.coop.finance.lineCommitment = defaultCommitment(state);
  const crng = stream(setup.gameSeed, -1, 'competitors.generate');
  state.competitors = generateCompetitors(state, crng, setup.startYear);
  ensureHomeIndependent(state, crng, setup.startYear);
  generateSupplyCompetitors(state, stream(setup.gameSeed, -1, 'competitors.supply'), setup.startYear);
  generateOffers(state, getMarketPath(setup.gameSeed, setup.historyMode, drift), crng, MARKETPLACE.initialOffers, startMonth, setup.startYear, homeTown.id);

  // Founding memos.
  const dir = governance.directors.map((d) => {
    const m = list.find((x) => x.id === d.memberId)!;
    return `${m.name}${d.office ? ` (${d.office})` : ''} — ${d.districtId === null ? 'at large' : territory.districts[d.districtId].name}, ${territory.towns[m.townId].name}`;
  });
  const lender = setup.lenderId === 'local-bank' ? 'a local commercial bank' : getBrand(setup.lenderId)?.name ?? setup.lenderId;
  const regionals = setup.regionalAffiliations.map((r) => `${getBrand(r.regionalId)?.name ?? r.regionalId} (${r.lines.join(', ')})`).join('; ') || 'none yet';
  const push = (title: string, body: string) => state.inbox.push({ id: state.nextInboxId++, monthIndex: startMonth, kind: 'memo', title, body, read: false });
  push(
    `${name} is organized`,
    `At an organizing meeting in ${homeTown.name}, ${founders.length} farmers subscribed for member stock and elected a board of ${governance.directors.length} directors. The board has hired you as General Manager.\n\nBoard of directors:\n${dir.join('\n')}`,
  );
  push(
    'Banking and supply arrangements',
    `The board approved ${lender} as the cooperative's lender and affiliation with: ${regionals}.\n\nThe cooperative owns no facilities yet. The usual first move is to buy an existing elevator from a retiring independent owner or to build one: see the Grain screen's "Buy or build" tab. The lender has approved a seasonal line of ${formatCents(state.coop.finance.lineCommitment)} and will finance up to ${Math.round(LENDING.maxFinancePct.value * 100)}% of facility purchases with term debt.`,
  );
  push('Welcome', `It is ${formatMonth(startMonth)}. Review the markets, your members, and the map. End the month when ready.`);
  state.history.push(snapshot(state));
  return state;
}
