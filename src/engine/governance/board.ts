// Founding board (DESIGN §14). Full governance arrives in M5; M1 elects the first board.

import { GOVERNANCE_SETUP, DIRECTOR_TRAITS } from '../../data/tuning';
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
  const [lit0, lit1] = DIRECTOR_TRAITS.literacy.value;
  const [loy0, loy1] = DIRECTOR_TRAITS.loyaltyToGM.value;
  seats.forEach((seat, i) => {
    const m = pickFrom(seat.districtId === null ? eligible : eligible.filter((x) => x.districtId === seat.districtId)) ?? pickFrom(eligible);
    if (!m) return;
    m.isDirector = true;
    directors.push({
      memberId: m.id, districtId: seat.districtId,
      // Staggered terms: a third of seats stand each year.
      termEndYear: year + 1 + (i % GOVERNANCE_SETUP.termYears),
      stance: clamp(rng.normal(0, 0.45), -1, 1),
      literacy: rng.int(lit0, lit1),
      loyaltyToGM: rng.int(loy0, loy1),
      tenureYears: 0,
      petIssues: petIssues(rng, m),
    });
  });
  const byLit = [...directors].sort((a, b) => b.literacy + b.loyaltyToGM / 10 - (a.literacy + a.loyaltyToGM / 10));
  if (byLit[0]) byLit[0].office = 'chair';
  if (byLit[1]) byLit[1].office = 'vice';
  if (byLit[2]) byLit[2].office = 'secretary';
  return {
    bylaws: { boardSize: size, districts, atLargeSeats: atLarge, termYears: GOVERNANCE_SETUP.termYears, supermajority: GOVERNANCE_SETUP.supermajority.value },
    directors,
    boardConfidence: 60,
  };
}
