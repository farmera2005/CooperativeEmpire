// New game setup and the founding sequence (DESIGN §3).

import { defaultSugarPolicy, emptySugarBook } from '../sugar/operate';
import { foundSugarCooperative, generateSugarCompany } from '../sugar/company';
import { SUGAR_COMPANY } from '../../data/sugar';
import { emptyTech } from '../world/tech';
import { emptyRegulation } from '../world/regulation';
import { brandsAvailable, getBrand } from '../../data/brands';
import { COOP_NAME_PATTERNS } from '../../data/names';
import { REGIONS } from '../../data/regions/eccb';
import { GOVERNANCE_SETUP, LENDING, SETUP, TERRITORY } from '../../data/tuning';
import { MARKETPLACE } from '../../data/grain';
import { formatCents } from '../core/format';
import { borrowingBase, defaultCommitment, emptyFinance, lineDrawn, renewalCommitment } from '../finance/lender';
import { emptyEquityProgram, emptyRegional } from '../finance/defaults';
import { defaultAffiliations } from '../finance/regionals';
import { emptyPeople } from '../people/leaders';
import { ensureHomeIndependent, formCountyCoops, generateCompetitors, generateOffers, generateSupplyCompetitors } from '../competitors/competitors';
import { ensureSiteUnits } from '../competitors/plants';
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
import { newCareer } from '../career/core';
import { PRIVATE } from '../../data/private';
import { SURNAMES } from '../../data/names';
import { emptyPrivateCo } from '../private/private';

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
export function territoryCustomers(setup: Pick<GameSetup, 'startingMembers' | 'territoryCustomers' | 'territorySize'>): number {
  const area = territoryArea(setup);
  const [lo, hi0] = SETUP.customersRange;
  const hi = Math.round(hi0 * Math.max(1, area));
  const members = Math.round(setup.startingMembers);
  // A larger map holds proportionally more farms; the extra ones start as non-members (D-138).
  const wanted = setup.territoryCustomers ?? Math.round(members * (1 + SETUP.nonMemberShare.value) * area);
  return Math.max(members, Math.max(lo, Math.min(hi, Math.round(wanted))));
}

/** Territory preview for the setup screen (town names for the name generator, home town). The map is sized to the farms it holds. */
/** Land area of the map against the standard one (D-138). */
export const territoryArea = (setup: Pick<GameSetup, 'territorySize'>): number => TERRITORY.sizes.value[setup.territorySize ?? 'standard'];

export function previewTerritory(setup: Pick<GameSetup, 'mapSeed' | 'regionId' | 'startYear' | 'startingMembers' | 'territoryCustomers' | 'territorySize'>): Territory {
  const t = generateTerritory(setup.mapSeed, REGIONS[setup.regionId], setup.startYear, territoryCustomers(setup), territoryArea(setup));
  t.districts = makeDistricts(t, GOVERNANCE_SETUP.districts, townFarmWeight);
  return t;
}

export function defaultHomeTown(t: Territory): Town {
  const cx = t.width / 2;
  const cy = t.height / 2;
  return [...t.towns].sort((a, b) => Number(b.isCountySeat) - Number(a.isCountySeat) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
}

export function suggestCoopNames(t: Territory, year: number, seed: number, count = 5, coopType: GameSetup['coopType'] = 'grain', orgType: GameSetup['orgType'] = 'coop'): string[] {
  const rng = stream(seed, -1, 'setup.names', year);
  const patterns = orgType === 'private' ? PRIVATE.namePatterns.map((pattern) => ({ pattern })) : coopType === 'sugar' ? SUGAR_COMPANY.namePatterns.map((pattern) => ({ pattern })) : COOP_NAME_PATTERNS.filter((p) => year >= p.from && year < p.to);
  const out = new Set<string>();
  for (let i = 0; i < 50 && out.size < count; i++) {
    const town = rng.weighted(t.towns, (x) => x.population);
    const county = t.counties[town.countyId];
    out.add(rng.pick(patterns).pattern.replace('{town}', town.name).replace('{county}', county.name).replace('{surname}', rng.pick(SURNAMES)));
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
  // A private company is a grain and farm-supply business that banks commercially (D-149).
  if (setup.orgType === 'private') setup = { ...setup, coopType: 'grain', lenderId: 'local-bank' };
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
  // On larger maps the founders live around the home town (D-138).
  const area = territoryArea(setup);
  const list = generateMembers(setup.gameSeed, territory.towns, region, setup.startYear, startMonth, members, customers, area > 1 ? { x: homeTown.x, y: homeTown.y, radius: TERRITORY.foundersRadiusMiles.value } : undefined);
  // A private company (D-149): every farm is a customer; a controlling owner has no board, a
  // family company that hires its CEO has a small owners' board.
  const privateCo = setup.orgType === 'private';
  const stake = privateCo ? clampStake(setup.ownerStake ?? 1) : 0;
  if (privateCo) for (const m of list) m.kind = 'nonmember';
  const governance = privateCo
    ? stake >= 0.5
      ? { ...electFoundingBoard(stream(setup.gameSeed, -1, 'governance.founding'), [], territory.districts.length, setup.startYear, { size: 0 }) }
      : stripCoopPetIssues(electFoundingBoard(stream(setup.gameSeed, -1, 'governance.founding'), list, territory.districts.length, setup.startYear, { anyFarm: true, size: PRIVATE.boardSize }))
    : electFoundingBoard(stream(setup.gameSeed, -1, 'governance.founding'), list, territory.districts.length, setup.startYear);
  const name = setup.coopName.trim() || suggestCoopNames(territory, setup.startYear, setup.gameSeed, 1, setup.coopType, setup.orgType)[0];

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
      facilities: [], projects: [], assets: [], designs: [], consultantLog: [], nextId: 1, grainPolicy: defaultGrainPolicy(), grain: emptyGrainBook(), offers: [],
      finance: emptyFinance(), grainStats: { marketBu: 0, offeredBu: 0, priceAdvantage: 0 },
      supply: emptySupply(), supplyPolicy: defaultSupplyPolicies(), sugar: emptySugarBook(), sugarPolicy: defaultSugarPolicy(), patronageStats: emptyPatronageStats(),
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
  // Career mode (D-142): the founding board hires the player's character.
  if (setup.career) state.career = newCareer(state, setup.career.character);

  // Founding capital: member stock subscriptions, in proportion to farm size.
  const capital = startingCapital({ ...setup, startingMembers: members });
  const founders = list.filter((m) => m.kind === 'member');
  if (privateCo) {
    // Owners put up the capital as paid-in equity; there is no member stock (D-149).
    const family = `${stream(setup.gameSeed, -1, 'private.owner').pick(SURNAMES)} family`;
    state.privateCo = emptyPrivateCo(stake, family);
    post(state, { source: 'founding', memo: stake >= 1 ? 'Owner\'s paid-in capital' : `Paid-in capital from the owners (${Math.round(stake * 100)}% yours)`, lines: [{ account: '1000', division: 'CORP', amount: capital }, { account: '3050', division: 'CORP', amount: -capital }] });
  } else {
    const parts = allocateCents(capital, founders.map((m) => totalAcres(m) + 50));
    founders.forEach((m, i) => (state.equity.commonStock[m.id] = parts[i]));
    post(state, {
      source: 'founding', memo: `Member stock subscriptions from ${founders.length} founding members`,
      lines: [{ account: '1000', division: 'CORP', amount: capital }, { account: '3000', division: 'CORP', amount: -capital }],
    });
  }

  // Lender commitment, competitors, and the first facilities offered for sale.
  state.coop.finance.lineCommitment = defaultCommitment(state);
  const crng = stream(setup.gameSeed, -1, 'competitors.generate');
  state.competitors = generateCompetitors(state, crng, setup.startYear);
  // Outer counties of a larger map start with county-wide co-ops (D-139).
  if (area > 1) formCountyCoops(state);
  ensureHomeIndependent(state, crng, setup.startYear);
  generateSupplyCompetitors(state, stream(setup.gameSeed, -1, 'competitors.supply'), setup.startYear);
  ensureSiteUnits(state);
  generateOffers(state, getMarketPath(setup.gameSeed, setup.historyMode, drift), crng, MARKETPLACE.initialOffers, startMonth, setup.startYear, homeTown.id);
  const sugarStart = setup.coopType === 'sugar';
  state.coop.sugar.company = generateSugarCompany(state, startMonth, sugarStart ? homeTown.id : undefined);
  // A sugar growers' co-op buys the territory's beet factory at founding (D-134).
  const sugarFounding = sugarStart ? foundSugarCooperative(state, SUGAR_COMPANY.foundingFinancePct.value) : null;
  // The seasonal line covers the campaign's beets and what was taken over with the factory.
  if (sugarStart) {
    state.coop.finance.lineCommitment = Math.max(state.coop.finance.lineCommitment, renewalCommitment(state), roundCents(lineDrawn(state) * 1.25));
    state.coop.finance.borrowingBase = borrowingBase(state);
  }

  // Founding memos.
  const dir = governance.directors.map((d) => {
    const m = list.find((x) => x.id === d.memberId)!;
    return `${m.name}${d.office ? ` (${d.office})` : ''} — ${d.districtId === null ? 'at large' : territory.districts[d.districtId].name}, ${territory.towns[m.townId].name}`;
  });
  const lender = setup.lenderId === 'local-bank' ? 'a local commercial bank' : getBrand(setup.lenderId)?.name ?? setup.lenderId;
  const regionals = setup.regionalAffiliations.map((r) => `${getBrand(r.regionalId)?.name ?? r.regionalId} (${r.lines.join(', ')})`).join('; ') || 'none yet';
  const push = (title: string, body: string) => state.inbox.push({ id: state.nextInboxId++, monthIndex: startMonth, kind: 'memo', title, body, read: false });
  if (privateCo) {
    const pc = state.privateCo!;
    push(
      `${name} is incorporated`,
      `${name} is incorporated in ${homeTown.name} with ${formatCents(capital)} of paid-in capital${stake >= 1 ? ', all of it yours' : stake >= 0.5 ? `: ${Math.round(stake * 100)}% yours, the rest from the ${pc.ownerName} and other local investors` : ` from the ${pc.ownerName}`}. ${stake >= 0.5 ? 'You control the company: there is no board to answer to and no one can fire you. The bank, the market and your customers are the judges.' : `The owners' board has hired ${state.career ? `you, ${state.career.character.name},` : 'you'} as chief executive.`}\n\nThe farmers around ${homeTown.name} are customers, not members: there is no patronage and no member equity. Win their business on price and service. At each year end the company pays corporate income tax on its income and pays the owners a dividend (${Math.round(pc.payout * 100)}% of net income unless you set it otherwise); the rest is retained.${dir.length ? `\n\nOwners' board:\n${dir.join('\n')}` : ''}`,
    );
    push('Banking and suppliers', `${lender[0].toUpperCase()}${lender.slice(1)} has approved a seasonal line of ${formatCents(state.coop.finance.lineCommitment)} and will finance up to ${Math.round(LENDING.maxFinancePct.value * 100)}% of facility purchases with term debt. The banks for cooperatives lend to co-ops, so a private company banks commercially. Regional co-ops will sell to us${regionals !== 'none yet' ? ` (${regionals})` : ''}, but only their member co-ops earn patronage.\n\nThe company owns no facilities yet. The usual first move is to buy an existing elevator from a retiring owner or to build one: see the Grain screen's "Buy or build" tab.`);
    push('Welcome', `It is ${formatMonth(startMonth)}. Review the markets, your customers and the map. End the month when ready.`);
    state.history.push(snapshot(state));
    return state;
  }
  push(
    `${name} is organized`,
    `At an organizing meeting in ${homeTown.name}, ${founders.length} farmers subscribed for member stock and elected a board of ${governance.directors.length} directors. The board has hired ${state.career ? `you, ${state.career.character.name},` : 'you'} as General Manager${state.career?.contract ? ` at ${formatCents(state.career.contract.base)} a year on a ${Math.round((state.career.contract.endMonth - state.career.contract.startMonth + 1) / 12)}-year agreement` : ''}.${sugarFounding ? `\n\n${sugarFounding}` : sugarStart ? `\n\nThe growers meant to buy ${state.coop.sugar.company?.name ?? 'the sugar company'}'s beet factory, but the money did not come together. The factory and stations stay on offer for a year (Sugar beets screen); a share drive can raise more.` : ''}\n\nBoard of directors:\n${dir.join('\n')}`,
  );
  push(
    'Banking and supply arrangements',
    `The board approved ${lender} as the cooperative's lender and affiliation with: ${regionals}.\n\n${sugarStart ? 'The cooperative\'s business is its beet factory and stations. It can add grain and farm supply later.' : 'The cooperative owns no facilities yet. The usual first move is to buy an existing elevator from a retiring independent owner or to build one: see the Grain screen\'s "Buy or build" tab.'} The lender has approved a seasonal line of ${formatCents(state.coop.finance.lineCommitment)} and will finance up to ${Math.round(LENDING.maxFinancePct.value * 100)}% of facility purchases with term debt.`,
  );
  push('Welcome', `It is ${formatMonth(startMonth)}. Review the markets, your members, and the map. End the month when ready.`);
  state.history.push(snapshot(state));
  return state;
}

const clampStake = (x: number): number => Math.max(0, Math.min(1, x));

/** A private company's directors ask nothing about patronage or equity redemption (D-149). */
function stripCoopPetIssues<T extends { directors: { petIssues: { kind: string }[] }[] }>(g: T): T {
  for (const d of g.directors) d.petIssues = d.petIssues.filter((p) => p.kind !== 'redemption' && p.kind !== 'patronageCash');
  return g;
}
