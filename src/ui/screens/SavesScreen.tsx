import { useEffect, useRef, useState } from 'react';
import { deleteSlot, exportSave, importSave, listSlots, loadSlot, saveSlot, type SlotMeta } from '../../persistence/saves';
import { Panel } from '../components/Panel';
import { useStore } from '../store';

export function SavesScreen() {
  const game = useStore((s) => s.game)!;
  const load = useStore((s) => s.load);
  const setScreen = useStore((s) => s.setScreen);
  const [slots, setSlots] = useState<SlotMeta[]>([]);
  const [name, setName] = useState(game.coop.name);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => listSlots().then(setSlots).catch((e) => setMsg(String(e)));
  useEffect(() => { refresh(); }, []);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg(ok); refresh(); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="max-w-4xl space-y-4">
      <Panel title="Save this game">
        <div className="flex flex-wrap gap-2">
          <input className="input w-80" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" onClick={() => run(() => saveSlot(game, name), 'Saved.')}>Save</button>
          <button className="btn" onClick={() => exportSave(game, name)}>Export as JSON file</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import JSON file…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await run(async () => load((await importSave(f)).state), 'Imported.');
          }} />
          <button className="btn ml-auto" onClick={() => setScreen('title')}>Quit to title</button>
        </div>
        {msg && <div className="mt-2 text-sm">{msg}</div>}
      </Panel>
      <Panel title="Saved games">
        <table className="data">
          <thead><tr><th>Name</th><th>Co-op</th><th>Game date</th><th>Saved</th><th></th></tr></thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id}>
                <td>{s.auto ? 'Autosave' : s.name}</td><td>{s.coopName}</td><td>{s.dateLabel}</td><td>{new Date(s.savedAt).toLocaleString()}</td>
                <td className="flex gap-1">
                  <button className="btn" onClick={() => run(async () => load((await loadSlot(s.id)).state), 'Loaded.')}>Load</button>
                  <button className="btn" onClick={() => run(() => deleteSlot(s.id), 'Deleted.')}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">The game autosaves every month and keeps the three most recent autosaves.</p>
      </Panel>
    </div>
  );
}
