// Saved games. Signed in to the game server (D-127), saves belong to the account and live on the
// server; without a server they stay in this browser's IndexedDB (gzip-compressed JSON). JSON
// file export and import work either way.

import { createStore, del, get, keys, set } from 'idb-keyval';
import { formatMonth, parseSave, serializeSave, toSaveFile, type GameState, type SaveFile } from '../engine/index';
import { deleteServerSave, listServerSaves, readServerSave, writeServerSave } from '../ui/accountClient';

let target: 'server' | 'browser' = 'browser';
/** Where saves go: the signed-in account on the server, or this browser. */
export function setSaveTarget(t: 'server' | 'browser'): void { target = t; }

const store = createStore('ag-coop-tycoon', 'saves');
const AUTOSAVES_KEPT = 3;

export interface SlotMeta {
  id: string;
  name: string;
  coopName: string;
  monthIndex: number;
  dateLabel: string;
  savedAt: string;
  auto: boolean;
}

async function gzip(text: string): Promise<Blob> {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([text]).stream().pipeThrough(cs);
  return await new Response(stream).blob();
}

async function gunzip(blob: Blob): Promise<string> {
  const ds = new DecompressionStream('gzip');
  return await new Response(blob.stream().pipeThrough(ds)).text();
}

export async function listSlots(): Promise<SlotMeta[]> {
  return target === 'server' ? listServerSaves() : listBrowserSlots();
}

export async function saveSlot(state: GameState, name: string, auto = false): Promise<SlotMeta> {
  if (target === 'browser') return saveBrowserSlot(state, name, auto);
  const file = toSaveFile(state, name, new Date().toISOString());
  return writeServerSave({ name, coopName: state.coop.name, monthIndex: state.clock.monthIndex, dateLabel: formatMonth(state.clock.monthIndex), auto, data: serializeSave(file) });
}

export async function loadSlot(id: string): Promise<SaveFile> {
  return target === 'server' ? parseSave(await readServerSave(id)) : loadBrowserSlot(id);
}

export async function deleteSlot(id: string): Promise<void> {
  if (target === 'server') await deleteServerSave(id);
  else await deleteBrowserSlot(id);
}

/** Saves kept in this browser (also offered for moving into an account). */
export async function listBrowserSlots(): Promise<SlotMeta[]> {
  const all = (await keys(store)) as string[];
  const metas = await Promise.all(all.filter((k) => k.startsWith('meta:')).map((k) => get<SlotMeta>(k, store)));
  return metas.filter((m): m is SlotMeta => !!m).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

async function saveBrowserSlot(state: GameState, name: string, auto: boolean): Promise<SlotMeta> {
  const savedAt = new Date().toISOString();
  const id = auto ? `auto-${state.clock.monthIndex}-${Date.now()}` : `slot-${name.replace(/[^\w -]/g, '').slice(0, 40) || 'save'}`;
  const file = toSaveFile(state, name, savedAt);
  const meta: SlotMeta = { id, name, coopName: state.coop.name, monthIndex: state.clock.monthIndex, dateLabel: formatMonth(state.clock.monthIndex), savedAt, auto };
  await set(`data:${id}`, await gzip(serializeSave(file)), store);
  await set(`meta:${id}`, meta, store);
  if (auto) {
    const autos = (await listBrowserSlots()).filter((m) => m.auto);
    for (const old of autos.slice(AUTOSAVES_KEPT)) await deleteBrowserSlot(old.id);
  }
  return meta;
}

export async function loadBrowserSlot(id: string): Promise<SaveFile> {
  const blob = await get<Blob>(`data:${id}`, store);
  if (!blob) throw new Error('Save not found');
  return parseSave(await gunzip(blob));
}

export async function deleteBrowserSlot(id: string): Promise<void> {
  await del(`data:${id}`, store);
  await del(`meta:${id}`, store);
}

/** Move this browser's saves into the signed-in account (server), removing them from the browser. */
export async function moveBrowserSavesToAccount(): Promise<number> {
  let moved = 0;
  for (const meta of [...(await listBrowserSlots())].reverse()) {
    const file = await loadBrowserSlot(meta.id);
    await writeServerSave({ name: meta.name, coopName: meta.coopName, monthIndex: meta.monthIndex, dateLabel: meta.dateLabel, auto: meta.auto, data: serializeSave(file) });
    await deleteBrowserSlot(meta.id);
    moved++;
  }
  return moved;
}

export function exportSave(state: GameState, name: string): void {
  const text = serializeSave(toSaveFile(state, name, new Date().toISOString()));
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.coop.name.replace(/[^\w]+/g, '-')}-${formatMonth(state.clock.monthIndex).replace(' ', '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importSave(file: File): Promise<SaveFile> {
  return parseSave(await file.text());
}
