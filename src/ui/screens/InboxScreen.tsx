import { useState } from 'react';
import { formatMonth } from '../../engine/index';
import { useStore } from '../store';

export function InboxScreen() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const items = [...game.inbox].reverse();
  const [selId, setSelId] = useState<number | null>(items[0]?.id ?? null);
  const sel = items.find((i) => i.id === selId) ?? null;
  const open = (id: number) => {
    setSelId(id);
    const it = items.find((i) => i.id === id);
    if (it && !it.read) command({ type: 'markInboxRead', id });
  };
  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,2fr)_3fr]">
      <section className="panel max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-stone-200 p-2">
          <h2 className="panel-title p-0">News & inbox</h2>
          <button className="text-xs underline" onClick={() => command({ type: 'markAllInboxRead' })}>Mark all read</button>
        </div>
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              <button onClick={() => open(i.id)} className={`block w-full border-b border-stone-100 px-3 py-2 text-left hover:bg-stone-50 ${selId === i.id ? 'bg-[#f1ead2]' : ''}`}>
                <div className="flex justify-between text-xs text-stone-500"><span className="uppercase">{i.kind === 'history' ? 'News' : i.kind}</span><span>{formatMonth(i.monthIndex)}</span></div>
                <div className={`${i.read ? '' : 'font-semibold'} ${i.kind === 'history' ? 'headline' : ''}`}>{i.title}</div>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <article className="panel p-5">
        {sel ? (
          <>
            <div className="text-xs uppercase text-stone-500">{formatMonth(sel.monthIndex)}</div>
            <h2 className={`mt-1 text-2xl font-bold ${sel.kind === 'history' ? 'headline' : ''}`}>{sel.title}</h2>
            <div className="mt-3 whitespace-pre-wrap leading-relaxed">{sel.body}</div>
          </>
        ) : <p className="text-stone-500">Nothing selected.</p>}
      </article>
    </div>
  );
}
