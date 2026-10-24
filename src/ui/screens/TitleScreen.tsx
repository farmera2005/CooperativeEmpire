import { useEffect, useRef, useState } from 'react';
import { importSave, listSlots, loadSlot, type SlotMeta } from '../../persistence/saves';
import { useStore } from '../store';
import { SCENARIOS } from '../../data/scenarios';

export function TitleScreen() {
  const setScreen = useStore((s) => s.setScreen);
  const load = useStore((s) => s.load);
  const [slots, setSlots] = useState<SlotMeta[]>([]);
  const [err, setErr] = useState('');
  const startScenario = useStore((s) => s.startScenario);
  const [busy, setBusy] = useState<string | null>(null);
  // Generating the co-op's history takes a moment; let the label paint first.
  const play = (id: string) => {
    setBusy(id);
    setTimeout(() => startScenario(id), 30);
  };
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    listSlots().then(setSlots).catch(() => setSlots([]));
  }, []);
  const open = async (id: string) => {
    try {
      load((await loadSlot(id)).state);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-8 p-8">
      <header>
        <div className="text-sm uppercase tracking-[0.3em] text-field">A farmer-owned business simulation</div>
        <h1 className="headline mt-2 text-5xl font-bold">Agricultural Cooperative Tycoon</h1>
        <p className="mt-3 text-stone-600">
          Run a Corn Belt farmer cooperative from its founding through decades of real agricultural history. The owners are your
          customers: deliver competitive prices, good service and patronage while keeping the co-op financially sound.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary px-5 py-2 text-base" onClick={() => setScreen('newGame')}>New cooperative</button>
        {slots[0] && <button className="btn px-5 py-2 text-base" onClick={() => open(slots[0].id)}>Continue: {slots[0].coopName}, {slots[0].dateLabel}</button>}
        <button className="btn px-5 py-2 text-base" onClick={() => fileRef.current?.click()}>Import save file…</button>
        <button className="btn px-5 py-2 text-base" onClick={() => setScreen('settings')}>Settings</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { load((await importSave(f)).state); } catch (x) { setErr((x as Error).message); }
        }} />
      </div>
      {err && <div className="text-rust">{err}</div>}
      <section aria-labelledby="scenarios-h">
        <h2 id="scenarios-h" className="headline text-xl font-bold">Scenarios</h2>
        <p className="text-sm text-stone-600">Take over an established co-op at a turning point, with goals to meet.</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {SCENARIOS.map((sc) => (
            <button key={sc.id} className="panel p-3 text-left hover:bg-[#f6f1e1] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky" disabled={busy !== null} onClick={() => play(sc.id)}>
              <div className="text-xs uppercase tracking-wide text-field">{sc.year}</div>
              <div className="headline text-lg font-bold">{sc.title}</div>
              <div className="mt-1 text-sm text-stone-600">{sc.teaser}</div>
              <div className="mt-2 text-xs text-stone-500">{busy === sc.id ? 'Writing the co-op\'s history…' : `Goals judged in ${sc.deadlineYear}`}</div>
            </button>
          ))}
        </div>
      </section>
      {slots.length > 0 && (
        <section className="panel">
          <h2 className="panel-title">Saved games</h2>
          <table className="data">
            <thead><tr><th>Save</th><th>Co-op</th><th>Game date</th><th>Saved</th><th></th></tr></thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id}>
                  <td>{s.auto ? 'Autosave' : s.name}</td><td>{s.coopName}</td><td>{s.dateLabel}</td>
                  <td>{new Date(s.savedAt).toLocaleString()}</td>
                  <td><button className="btn" onClick={() => open(s.id)}>Load</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <footer className="border-t border-stone-300 pt-4 text-xs text-stone-500">
        A personal, non-commercial project. Not affiliated with or endorsed by any company named in the game. Real companies
        appear only as suppliers, partners, buyers and competitors, consistent with the historical record; all people,
        towns, and local cooperatives are fictional.
      </footer>
    </main>
  );
}
