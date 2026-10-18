// src/save/slotView.ts — how saved slots are listed to the player: labels, times, the rows of each list
// (pure: no DOM, node-runnable)

import { isAutoSlot, MANUAL_SLOTS, newestFirst, type SlotId, type SlotMeta } from './slots.ts';

export interface SlotRow {
  id: SlotId;
  /** "Autosave", "Previous autosave" or "Slot 2". */
  label: string;
  /** Null for an empty manual slot. */
  meta: SlotMeta | null;
}

const manualLabel = (id: SlotId) => `Slot ${id.slice(id.lastIndexOf('-') + 1)}`;

const manualRows = (metas: readonly SlotMeta[]): SlotRow[] => {
  const byId = new Map(metas.map((m) => [m.id, m]));
  return MANUAL_SLOTS.map((id) => ({ id, label: manualLabel(id), meta: byId.get(id) ?? null }));
};

/** Every slot the player can load from: the autosaves that exist (newest first), then the three manual slots. */
export function loadRows(metas: readonly SlotMeta[]): SlotRow[] {
  const autos = newestFirst(metas.filter((m) => isAutoSlot(m.id))).map(
    (meta, i): SlotRow => ({
      id: meta.id,
      label: i === 0 ? 'Autosave' : 'Previous autosave',
      meta,
    }),
  );
  return [...autos, ...manualRows(metas)];
}

/** The slots a player saves into: the three manual ones. */
export function saveRows(metas: readonly SlotMeta[]): SlotRow[] {
  return manualRows(metas);
}

/** "under a minute", "12 min", "1 h 05 min". */
export function formatPlayTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "just now", "5 min ago", "today 14:30", "yesterday 09:05", "3 Oct 2026" (the player's local time). */
export function formatSavedAt(savedAt: number, now: number): string {
  const diffMin = Math.floor((now - savedAt) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const then = new Date(savedAt);
  const today = new Date(now);
  if (sameDay(then, today)) return `today ${clock(then)}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(then, yesterday)) return `yesterday ${clock(then)}`;
  return `${then.getDate()} ${MONTHS[then.getMonth()]} ${then.getFullYear()}`;
}

/** The two lines under a slot's name. */
export function describeSlot(meta: SlotMeta, now: number): { title: string; detail: string } {
  const people = meta.summary.population;
  return {
    title: `Day ${meta.summary.day} · ${people} ${people === 1 ? 'villager' : 'villagers'}`,
    detail: `${formatPlayTime(meta.playSeconds)} played · saved ${formatSavedAt(meta.savedAt, now)}`,
  };
}
