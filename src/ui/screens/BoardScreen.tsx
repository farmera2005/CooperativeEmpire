import { yearOf } from '../../engine/index';
import { Panel } from '../components/Panel';
import { useStore } from '../store';

const stanceLabel = (s: number) => (s > 0.35 ? 'Growth-minded' : s < -0.35 ? 'Conservative' : 'Moderate');
const literacyLabel = (l: number) => (l >= 15 ? 'Strong with numbers' : l >= 9 ? 'Reads the financials' : 'Goes by the headline');

export function BoardScreen() {
  const game = useStore((s) => s.game)!;
  const gov = game.governance;
  const year = yearOf(game.clock.monthIndex);
  const members = new Map(game.members.list.map((m) => [m.id, m]));
  const towns = game.world.towns;
  return (
    <div className="space-y-4">
      <Panel title="Board of directors">
        <table className="data">
          <thead><tr><th>Director</th><th>Office</th><th>Seat</th><th>Town</th><th className="r">Age</th><th className="r">Term ends</th><th>Outlook</th><th>Financial literacy</th><th>Pet issues</th></tr></thead>
          <tbody>
            {gov.directors.map((d) => {
              const m = members.get(d.memberId);
              if (!m) return null;
              return (
                <tr key={d.memberId}>
                  <td>{m.name}</td>
                  <td className="capitalize">{d.office ?? ''}</td>
                  <td>{d.districtId === null ? 'At large' : game.world.districts[d.districtId]?.name}</td>
                  <td>{towns[m.townId].name}</td>
                  <td className="r">{year - m.birthYear}</td>
                  <td className="r">{d.termEndYear}</td>
                  <td>{stanceLabel(d.stance)}</td>
                  <td>{literacyLabel(d.literacy)}</td>
                  <td className="text-xs">{d.petIssues.map((p) => p.kind === 'hometown' ? `keep ${towns[p.townId ?? 0]?.name} served` : p.kind === 'division' ? `${p.favor ? 'champions' : 'skeptical of'} ${p.division?.toLowerCase()}` : p.kind === 'merger' ? (p.favor ? 'open to mergers' : 'against mergers') : p.kind === 'redemption' ? 'pay out old equity' : p.kind === 'patronageCash' ? 'more cash patronage' : 'fiscal caution').join('; ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <Panel title="Bylaws">
        <ul className="text-sm">
          <li>Board of {gov.bylaws.boardSize} directors: {gov.bylaws.districts} districts plus {gov.bylaws.atLargeSeats} at-large seat(s); staggered {gov.bylaws.termYears}-year terms.</li>
          <li>Structural votes (mergers, dissolution, sale of substantially all assets, bylaw amendments) require {(gov.bylaws.supermajority * 100).toFixed(0)}% of votes cast.</li>
          <li>One member, one vote. Only active producer members vote.</li>
        </ul>
        <p className="mt-2 text-xs text-stone-500">Board meetings, proposals, votes, elections and GM evaluations arrive in Milestone 5.</p>
      </Panel>
    </div>
  );
}
