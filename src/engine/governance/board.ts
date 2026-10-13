// Founding board and director records (DESIGN §14.2).

import { GOVERNANCE_SETUP, DIRECTOR_TRAITS } from '../../data/tuning';
import { BYLAWS_DEFAULT, CONFIDENCE, POLITICAL_CAPITAL } from '../../data/governance';
import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import type { Director, GovernanceState, Member, PetIssue, DivisionId } from '../types';
import { totalAcres } from '../members/generate';

export function boardSizeFor(members: number): number {
  for (const r of GOVERNANCE_SETUP.boardSizeByMembers) if (members <= r.maxMembers) return r.size;
  return 11;
}

function petIssues(rng: Rng, m: Member): PetIssue[] {
  const out: PetIssue[] = [{ kind: 'hometown', townId: m.townId }];
  const r = rng.next();
  const divs: DivisionId[] = ['GRAIN', 'AGRONOMY', 'FEED', 'ENERGY', 'RETAIL'];
  if (r < 0.25) out.push({ kind: 'redemption' });
  else if (r < 0.45) out.push({ kind: 'patronageCash' });
  else if (r < 0.65) out.push({ kind: 'division', division: rng.pick(divs), favor: rng.chance(0.6) });
  else if (r < 0.8) out.push({ kind: 'merger', favor: rng.chance(0.4) });
  else out.push({ kind: 'conservative' });
  return out;
}

/** The organizing meeting elects the first board from the founding members. */
export function electFoundingBoard(rng: Rng, members: Member[], districts: number, year: number): GovernanceState {
  const memberCount = members.filter((m) => m.kind === 'member').length;
  const size = boardSizeFor(memberCount);
  const perDistrict = Math.floor(size / districts);
  const atLarge = size - perDistrict * districts;
  const eligible = members.filter((m) => m.kind === 'member' && m.status === 'active' && year - m.birthYear >= GOVERNANCE_SETUP.directorMinAge && year - m.birthYear <= GOVERNANCE_SETUP.directorMaxAge);
  const chosen = new Set<number>();
  const pickFrom = (pool: Member[]) => {
    const avail = pool.filter((m) => !chosen.has(m.id));
    if (!avail.length) return undefined;
    const m = rng.weighted(avail, (x) => Math.sqrt(totalAcres(x) + 50) * (0.5 + x.loyalty));
    chosen.add(m.id);
    return m;
  };
  const seats: { districtId: number | null }[] = [];
  for (let d = 0; d < districts; d++) for (let k = 0; k < perDistrict; k++) seats.push({ districtId: d });
  for (let k = 0; k < atLarge; k++) seats.push({ districtId: null });
  const directors: Director[] = [];
  seats.forEach((seat, i) => {
    const m = pickFrom(seat.districtId === null ? eligible : eligible.filter((x) => x.districtId === seat.districtId)) ?? pickFrom(eligible);
    if (!m) return;
    // Staggered terms: a third of seats stand each year.
    directors.push(makeDirector(rng, m, seat.districtId, year + 1 + (i % GOVERNANCE_SETUP.termYears)));
  });
  assignOfficers(directors);
  return {
    bylaws: {
      boardSize: size, districts, atLargeSeats: atLarge, termYears: GOVERNANCE_SETUP.termYears, termLimit: BYLAWS_DEFAULT.termLimit,
      supermajority: GOVERNANCE_SETUP.supermajority.value, quorumPct: BYLAWS_DEFAULT.quorumPct.value, capitalApproval: BYLAWS_DEFAULT.capitalApproval.value,
      memberPetitionPct: BYLAWS_DEFAULT.memberPetitionPct.value,
    },
    directors,
    ...emptyBoardActivity(),
  };
}

export function emptyBoardActivity(): Omit<GovernanceState, 'bylaws' | 'directors'> {
  return {
    boardConfidence: CONFIDENCE.start, politicalCapital: POLITICAL_CAPITAL.max, agenda: [], nextItemId: 1, votes: [], demands: [], reviews: [],
    pip: false, endorse: false, elections: [], memberVotes: [], lastPetitionMonth: null,
  };
}

/** A new director's traits. Insurgents bring their platform as a pet issue and little loyalty to the GM. */
export function makeDirector(rng: Rng, m: Member, districtId: number | null, termEndYear: number, platform?: PetIssue['kind']): Director {
  m.isDirector = true;
  const [lit0, lit1] = DIRECTOR_TRAITS.literacy.value;
  const [loy0, loy1] = DIRECTOR_TRAITS.loyaltyToGM.value;
  const pets = petIssues(rng, m);
  let stance = clamp(rng.normal(0, 0.45), -1, 1);
  let loyalty = rng.int(loy0, loy1);
  if (platform) {
    loyalty = Math.max(10, loyalty - 25);
    if (platform === 'conservative') stance = clamp(-0.4 - Math.abs(rng.normal(0, 0.3)), -1, 1);
    if (!pets.some((p) => p.kind === platform)) pets.push(platform === 'hometown' ? { kind: 'hometown', townId: m.townId } : { kind: platform });
  }
  return { memberId: m.id, districtId, termEndYear, stance, literacy: rng.int(lit0, lit1), loyaltyToGM: loyalty, tenureYears: 0, petIssues: pets };
}

/** Chair, vice chair and secretary: the most numerate directors, with some regard for the GM. */
export function assignOfficers(directors: Director[]): void {
  const chair = directors.find((d) => d.office === 'chair');
  for (const d of directors) delete d.office;
  const ranked = [...directors].sort((a, b) => b.literacy + b.loyaltyToGM / 10 + b.tenureYears / 3 - (a.literacy + a.loyaltyToGM / 10 + a.tenureYears / 3) || a.memberId - b.memberId);
  const order = chair && directors.includes(chair) ? [chair, ...ranked.filter((d) => d !== chair)] : ranked;
  if (order[0]) order[0].office = 'chair';
  if (order[1]) order[1].office = 'vice';
  if (order[2]) order[2].office = 'secretary';
}
