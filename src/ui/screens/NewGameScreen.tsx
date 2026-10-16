import { useMemo, useState } from 'react';
import { brandName, type SupplyLine } from '../../data/brands';
import { DATA_END_YEAR } from '../../data/markets';
import { SETUP } from '../../data/tuning';
import {
  availableLenders, availableRegionals, DEFAULT_SETUP, defaultHomeTown, MONTH_NAMES, previewTerritory, startingCapital,
  suggestCoopNames, type CapitalPreset, type GameSetup,
} from '../../engine/index';
import { TerritoryMap } from '../components/TerritoryMap';
import { Term } from '../components/Term';
import { money } from '../format';
import { useStore } from '../store';

const LINES: { id: SupplyLine; label: string }[] = [
  { id: 'grain', label: 'Grain marketing' },
  { id: 'agronomy', label: 'Agronomy (fertilizer, chemicals, seed)' },
  { id: 'feed', label: 'Feed' },
  { id: 'energy', label: 'Energy (fuel, propane, lubricants)' },
];

const randomSeed = () => Math.floor(Math.random() * 1_000_000) + 1;

export function NewGameScreen() {
  const start = useStore((s) => s.start);
  const setScreen = useStore((s) => s.setScreen);
  const [setup, setSetup] = useState<GameSetup>(() => ({ ...DEFAULT_SETUP, mapSeed: randomSeed(), gameSeed: randomSeed() }));
  const [customDollars, setCustomDollars] = useState('');
  const [guide, setGuide] = useState(true);
  const [nameSeed, setNameSeed] = useState(1);
  const up = (p: Partial<GameSetup>) => setSetup((s) => ({ ...s, ...p }));

  const territory = useMemo(
    () => previewTerritory({ mapSeed: setup.mapSeed, regionId: setup.regionId, startYear: setup.startYear, startingMembers: Math.max(SETUP.membersRange[0], Math.min(SETUP.membersRange[1], setup.startingMembers)) }),
    [setup.mapSeed, setup.regionId, setup.startYear, setup.startingMembers],
  );
  const homeTownId = setup.homeTownId !== undefined && setup.homeTownId < territory.towns.length ? setup.homeTownId : defaultHomeTown(territory).id;
  const suggestions = useMemo(() => suggestCoopNames(territory, setup.startYear, setup.mapSeed + nameSeed * 7919, 6), [territory, setup.startYear, setup.mapSeed, nameSeed]);
  const lenders = availableLenders(setup.startYear);
  const regionals = availableRegionals(setup.startYear, setup.regionId);
  const lenderId = lenders.some((l) => l.id === setup.lenderId) ? setup.lenderId : lenders[0].id;
  const capital = useMemo(() => {
    if (setup.capitalPreset === 'custom') return Math.round(Number(customDollars || 0) * 100);
    return startingCapital({ ...setup, lenderId });
  }, [setup, customDollars, lenderId]);
  const regionalFor = (line: SupplyLine) => setup.regionalAffiliations.find((a) => a.lines.includes(line))?.regionalId ?? '';
  const setRegional = (line: SupplyLine, id: string) => {
    const rest = setup.regionalAffiliations.map((a) => ({ ...a, lines: a.lines.filter((l) => l !== line) })).filter((a) => a.lines.length);
    if (id) {
      const ex = rest.find((a) => a.regionalId === id);
      if (ex) ex.lines.push(line);
      else rest.push({ regionalId: id, lines: [line] });
    }
    up({ regionalAffiliations: rest });
  };

  const valid = setup.startingMembers >= SETUP.membersRange[0] && setup.startingMembers <= SETUP.membersRange[1] && capital > 0;
  const go = () => start({
    ...setup, lenderId, homeTownId, coopName: setup.coopName.trim() || suggestions[0],
    ...(setup.capitalPreset === 'custom' ? { customCapital: capital } : {}),
  }, guide);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="headline text-3xl font-bold">Organize a new cooperative</h1>
        <button className="btn" onClick={() => setScreen('title')}>Back</button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel space-y-3 p-4">
          <label className="block">
            <span className="text-sm font-semibold">Cooperative name</span>
            <input className="input mt-1 w-full" value={setup.coopName} placeholder={suggestions[0]} onChange={(e) => up({ coopName: e.target.value })} />
            <div className="mt-1 flex flex-wrap gap-1">
              {suggestions.map((s) => <button key={s} className="rounded bg-stone-100 px-2 py-0.5 text-xs hover:bg-stone-200" onClick={() => up({ coopName: s })}>{s}</button>)}
              <button className="rounded px-2 py-0.5 text-xs text-sky underline" onClick={() => setNameSeed((n) => n + 1)}>more…</button>
            </div>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold">Starting year</span>
              <input type="number" className="input mt-1 w-full" min={1970} max={DATA_END_YEAR} value={setup.startYear}
                onChange={(e) => up({ startYear: Math.max(1970, Math.min(DATA_END_YEAR, Number(e.target.value) || 1970)) })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Founding members</span>
              <input type="number" className="input mt-1 w-full" min={SETUP.membersRange[0]} max={SETUP.membersRange[1]} value={setup.startingMembers}
                onChange={(e) => up({ startingMembers: Number(e.target.value) || 0 })} />
              <span className="text-xs text-stone-500">{SETUP.membersRange[0]}–{SETUP.membersRange[1]}; sets the size of the trade territory</span>
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold">Starting capital <span className="font-normal text-stone-500">(member stock subscriptions)</span></legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {(['shoestring', 'typical', 'well', 'custom'] as CapitalPreset[]).map((p) => (
                <label key={p} className="flex items-center gap-1">
                  <input type="radio" name="cap" checked={setup.capitalPreset === p} onChange={() => up({ capitalPreset: p })} />
                  {p === 'well' ? 'Well-capitalized' : p[0].toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
            {setup.capitalPreset === 'custom' && <input className="input mt-1" placeholder="Dollars" value={customDollars} onChange={(e) => setCustomDollars(e.target.value.replace(/[^\d.]/g, ''))} />}
            <div className="mt-1 text-sm">Raised: <b className="num">{money(capital)}</b> in {setup.startYear} dollars</div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold"><Term id="fiscal-year">Fiscal year end</Term></span>
              <select className="input mt-1 w-full" value={setup.fiscalYearEndMonth} onChange={(e) => up({ fiscalYearEndMonth: Number(e.target.value) })}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Difficulty</span>
              <select className="input mt-1 w-full" value={setup.difficulty} onChange={(e) => up({ difficulty: e.target.value as GameSetup['difficulty'] })}>
                <option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">History mode</span>
              <select className="input mt-1 w-full" value={setup.historyMode} onChange={(e) => up({ historyMode: e.target.value as GameSetup['historyMode'] })}>
                <option value="drift">History with drift</option><option value="strict">Strict history</option>
              </select>
              <span className="text-xs text-stone-500"><Term id="drift">What is drift?</Term></span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Seeds (map / game)</span>
              <div className="mt-1 flex gap-1">
                <input className="input w-24" value={setup.mapSeed} onChange={(e) => up({ mapSeed: Number(e.target.value) || 1, homeTownId: undefined })} />
                <input className="input w-24" value={setup.gameSeed} onChange={(e) => up({ gameSeed: Number(e.target.value) || 1 })} />
                <button className="btn" title="New map" onClick={() => up({ mapSeed: randomSeed(), homeTownId: undefined })}>↻</button>
              </div>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
            Guide me through the first year
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={setup.fictionalizeBrands} onChange={(e) => up({ fictionalizeBrands: e.target.checked })} />
            Use fictional names for all real companies and brands
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!setup.debugMode} onChange={(e) => up({ debugMode: e.target.checked })} />
            Debug mode: testing tools (add money, set confidence and satisfaction, place managers, no game over)
          </label>
        </section>

        <section className="panel space-y-3 p-4">
          <h2 className="font-semibold">Founding decisions</h2>
          <p className="text-sm text-stone-600">The organizing meeting elects the first board, which hires you as general manager and approves a lender and regional affiliations.</p>
          <label className="block">
            <span className="text-sm font-semibold">Home office town</span>
            <select className="input mt-1 w-full" value={homeTownId} onChange={(e) => up({ homeTownId: Number(e.target.value) })}>
              {territory.towns.map((t) => <option key={t.id} value={t.id}>{t.name} ({territory.counties[t.countyId].name} Co., pop. {t.population.toLocaleString()})</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Lender</span>
            <select className="input mt-1 w-full" value={lenderId} onChange={(e) => up({ lenderId: e.target.value })}>
              {lenders.map((l) => <option key={l.id} value={l.id}>{l.id === 'local-bank' ? l.name : brandName(l.id, setup.fictionalizeBrands)}</option>)}
            </select>
          </label>
          <div>
            <div className="text-sm font-semibold"><Term id="regional">Regional affiliations</Term></div>
            {LINES.map((line) => (
              <label key={line.id} className="mt-1 grid grid-cols-2 items-center gap-2 text-sm">
                <span>{line.label}</span>
                <select className="input" value={regionalFor(line.id)} onChange={(e) => setRegional(line.id, e.target.value)}>
                  <option value="">None / decide later</option>
                  {regionals.filter((r) => r.supplies?.includes(line.id)).map((r) => <option key={r.id} value={r.id}>{brandName(r.id, setup.fictionalizeBrands)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <TerritoryMap world={territory} homeTownId={homeTownId} height={300} fictionalize={setup.fictionalizeBrands} onSelectTown={(t) => up({ homeTownId: t.id })} selectedTownId={homeTownId} />
          <button className="btn btn-primary w-full justify-center py-2 text-base" disabled={!valid} onClick={go}>Hold the organizing meeting</button>
        </section>
      </div>
    </main>
  );
}
