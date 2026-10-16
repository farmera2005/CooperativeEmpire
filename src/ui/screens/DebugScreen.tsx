import { useState } from 'react';
import { ROLE_DEFS, ROLES, type Role } from '../../data/people';
import { averageSatisfaction, balance, type DebugAction } from '../../engine/index';
import { Panel, Stat } from '../components/Panel';
import { money } from '../format';
import { useStore } from '../store';

/** Testing tools for a game created in debug mode (D-105). */
export function DebugScreen() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const advanceMonths = useStore((s) => s.advanceMonths);
  const [cash, setCash] = useState(100_000);
  const [confidence, setConfidence] = useState(80);
  const [satisfaction, setSatisfaction] = useState(70);
  const [role, setRole] = useState<Role>('GRAIN');
  const [skill, setSkill] = useState(18);
  const debug = (action: DebugAction) => command({ type: 'debug', action });
  const added = -balance(game.ledger, '3950');
  return (
    <div className="space-y-4">
      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Debug mode: these tools change the game directly for testing. Every change goes through the books or the game state the same way play does, and the game is marked as a debug game.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cash" value={money(balance(game.ledger, '1000'))} />
        <Stat label="Debug capital added" value={money(added)} sub="equity account 3950" />
        <Stat label="Board confidence" value={Math.round(game.governance.boardConfidence)} />
        <Stat label="Member satisfaction" value={Math.round(averageSatisfaction(game))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Money">
          <div className="flex flex-wrap items-center gap-2">
            {[100_000, 1_000_000, 10_000_000].map((x) => (
              <button key={x} className="btn" onClick={() => debug({ kind: 'addCash', amount: x * 100 })}>Add {money(x * 100, { compact: true })}</button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-sm">Amount $ <input className="input ml-1 w-36" type="number" step={1000} value={cash} onChange={(e) => setCash(Number(e.target.value))} /></label>
            <button className="btn" onClick={() => debug({ kind: 'addCash', amount: Math.round(cash * 100) })}>Add</button>
            <button className="btn" onClick={() => debug({ kind: 'addCash', amount: -Math.round(cash * 100) })}>Remove</button>
          </div>
          <p className="mt-2 text-xs text-stone-500">Posted as cash against a debug equity account, so income, savings and patronage are not affected.</p>
        </Panel>

        <Panel title="Board and members">
          <div className="flex items-center gap-2">
            <label className="text-sm">Board confidence <input className="input ml-1 w-20" type="number" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} /></label>
            <button className="btn" onClick={() => debug({ kind: 'setConfidence', value: confidence })}>Set</button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-sm">Every member's satisfaction <input className="input ml-1 w-20" type="number" min={0} max={100} value={satisfaction} onChange={(e) => setSatisfaction(Number(e.target.value))} /></label>
            <button className="btn" onClick={() => debug({ kind: 'setSatisfaction', value: satisfaction })}>Set</button>
          </div>
        </Panel>

        <Panel title="Lender and game over">
          <button className="btn" onClick={() => debug({ kind: 'resetLender' })}>Reset lender standing to standard</button>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!game.setup.debugNoGameOver} onChange={(e) => debug({ kind: 'setNoGameOver', on: e.target.checked })} />
            No game over: cancel firing and liquidation, and keep playing
          </label>
        </Panel>

        <Panel title="People">
          <button className="btn" onClick={() => debug({ kind: 'revealLeaders' })}>Reveal everyone's true skills</button>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_DEFS[r].label}</option>)}
            </select>
            <label className="text-sm">Skill <input className="input ml-1 w-16" type="number" min={1} max={20} value={skill} onChange={(e) => setSkill(Number(e.target.value))} /></label>
            <button className="btn" onClick={() => debug({ kind: 'hireLeader', role, skill })}>Place a leader</button>
          </div>
          <p className="mt-2 text-xs text-stone-500">Places a leader with this skill in every area, replacing whoever holds the role, at market salary.</p>
        </Panel>

        <Panel title="Time">
          <div className="flex flex-wrap gap-2">
            {[3, 12, 60].map((n) => <button key={n} className="btn" onClick={() => advanceMonths(n)}>Advance {n} months</button>)}
          </div>
          <p className="mt-2 text-xs text-stone-500">Runs months without stopping; open decisions take their defaults when they come due.</p>
        </Panel>
      </div>
    </div>
  );
}
