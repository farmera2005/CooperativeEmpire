import { useState } from 'react';
import { formatMonth, type InboxItem } from '../../engine/index';
import { useStore } from '../store';

type Filter = 'all' | 'decisions' | 'news' | 'alert' | 'memo';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'decisions', label: 'Decisions' }, { id: 'news', label: 'News' }, { id: 'alert', label: 'Alerts' }, { id: 'memo', label: 'Memos' },
];
const matches = (i: InboxItem, f: Filter) =>
  f === 'all' || (f === 'decisions' ? !!i.choice : f === 'news' ? i.kind === 'news' || i.kind === 'history' : i.kind === f);

export function InboxScreen() {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const [filter, setFilter] = useState<Filter>(() => (game.inbox.some((i) => i.choice && !i.choice.chosen) ? 'decisions' : 'all'));
  const items = [...game.inbox].reverse().filter((i) => matches(i, filter));
  const [selId, setSelId] = useState<number | null>(items[0]?.id ?? null);
  const sel = game.inbox.find((i) => i.id === selId) ?? null;
  const open = (id: number) => {
    setSelId(id);
    const it = game.inbox.find((i) => i.id === id);
    if (it && !it.read) command({ type: 'markInboxRead', id });
  };
  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,2fr)_3fr]">
      <section className="panel max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-stone-200 p-2">
          <h2 className="panel-title p-0">News & inbox</h2>
          <button className="text-xs underline" onClick={() => command({ type: 'markAllInboxRead' })}>Mark all read</button>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-stone-200 p-2" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`rounded px-2 py-0.5 text-xs ${filter === f.id ? 'bg-[#d9cfae] font-semibold' : 'hover:bg-stone-100'}`}>{f.label}</button>
          ))}
        </div>
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              <button onClick={() => open(i.id)} className={`block w-full border-b border-stone-100 px-3 py-2 text-left hover:bg-stone-50 ${selId === i.id ? 'bg-[#f1ead2]' : ''}`}>
                <div className="flex justify-between text-xs text-stone-500">
                  <span className="uppercase">{i.choice && !i.choice.chosen ? <b className="text-rust">Decision</b> : i.kind === 'history' ? 'News' : i.kind}</span>
                  <span>{formatMonth(i.monthIndex)}</span>
                </div>
                <div className={`${i.read ? '' : 'font-semibold'} ${i.kind === 'history' ? 'headline' : ''}`}>{i.title}</div>
              </button>
            </li>
          ))}
          {!items.length && <li className="p-3 text-sm text-stone-500">Nothing here.</li>}
        </ul>
      </section>
      <article className="panel p-5">
        {sel ? (
          <>
            <div className="text-xs uppercase text-stone-500">{formatMonth(sel.monthIndex)}</div>
            <h2 className={`mt-1 text-2xl font-bold ${sel.kind === 'history' ? 'headline' : ''}`}>{sel.title}</h2>
            <div className="mt-3 whitespace-pre-wrap leading-relaxed">{sel.body}</div>
            {sel.choice && <Decision item={sel} />}
            {!sel.choice && sel.eventId && <RelatedDecision eventId={sel.eventId} onOpen={open} />}
          </>
        ) : <p className="text-stone-500">Nothing selected.</p>}
      </article>
    </div>
  );
}

function Decision({ item }: { item: InboxItem }) {
  const game = useStore((s) => s.game)!;
  const command = useStore((s) => s.command);
  const c = item.choice!;
  const decided = !!c.chosen;
  return (
    <div className="mt-4 space-y-2">
      {!decided && <div className="text-sm text-stone-600">Answer by {formatMonth(c.deadline)}; otherwise “{c.options.find((o) => o.id === c.defaultId)?.label}” applies.</div>}
      {c.options.map((o) => (
        <div key={o.id} className={`rounded border p-3 ${c.chosen === o.id ? 'border-field bg-[#eef5ea]' : 'border-stone-200'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{o.label}{o.id === c.defaultId && !decided ? <span className="ml-2 text-xs font-normal text-stone-500">(default)</span> : null}</div>
              <div className="text-sm text-stone-600">{o.detail}</div>
            </div>
            {!decided && game.clock.monthIndex <= c.deadline && <button className="btn btn-primary shrink-0" onClick={() => command({ type: 'chooseOption', inboxId: item.id, optionId: o.id })}>Choose</button>}
            {c.chosen === o.id && <span className="text-sm font-semibold text-field">Chosen</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A news item whose event asked a question links to the decision. */
function RelatedDecision({ eventId, onOpen }: { eventId: string; onOpen: (id: number) => void }) {
  const game = useStore((s) => s.game)!;
  const d = game.inbox.find((i) => i.choice?.handler === eventId);
  if (!d) return null;
  return <button className="btn mt-4" onClick={() => onOpen(d.id)}>{d.choice!.chosen ? 'See our decision' : 'Make the decision ▸'}</button>;
}
