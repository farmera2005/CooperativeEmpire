// Grievances (D-085). A repeat complaint of the same kind compounds gently instead of stacking:
// the stronger of the two plus a quarter of the weaker, up to a cap. Farmers remember being
// let down; they don't count every bad week as a fresh insult.

import { GRIEVANCES } from '../../data/tuning';
import type { Grievance, Member } from '../types';

export function addGrievance(m: Member, g: Grievance): void {
  const i = m.grievances.findIndex((x) => x.kind === g.kind && x.division === g.division);
  if (i < 0) {
    m.grievances.push({ ...g, severity: Math.min(GRIEVANCES.maxSeverity.value, g.severity) });
    if (m.grievances.length > 6) m.grievances.shift();
    return;
  }
  const old = m.grievances[i];
  const severity = Math.min(GRIEVANCES.maxSeverity.value, Math.max(old.severity, g.severity) + GRIEVANCES.repeatWeight.value * Math.min(old.severity, g.severity));
  m.grievances[i] = { ...old, month: g.month, severity: Math.round(severity * 100) / 100 };
}
