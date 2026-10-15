import { useMemo, useState } from 'react';
import { GLOSSARY } from '../../data/glossary';

export function GlossaryScreen() {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term)).filter((g) => !k || g.term.toLowerCase().includes(k) || g.text.toLowerCase().includes(k));
  }, [q]);
  return (
    <section className="panel mx-auto max-w-3xl p-4" aria-labelledby="glossary-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="glossary-h" className="headline text-2xl font-bold">Glossary</h2>
        <label className="text-sm">Search <input className="input ml-1 w-64" value={q} onChange={(e) => setQ(e.target.value)} placeholder="basis, patronage, covenant…" aria-label="Search the glossary" /></label>
      </div>
      <p className="mt-1 text-sm text-stone-600">Co-op and grain-trade terms used in the game. Dotted-underlined words elsewhere show these definitions on hover or focus.</p>
      <dl className="mt-3 divide-y divide-stone-100">
        {list.map((g) => (
          <div key={g.id} className="py-2">
            <dt className="font-semibold">{g.term}</dt>
            <dd className="text-sm text-stone-700">{g.text}</dd>
          </div>
        ))}
        {!list.length && <p className="py-2 text-sm text-stone-500">No terms match.</p>}
      </dl>
    </section>
  );
}
