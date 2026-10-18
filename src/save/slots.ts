// src/save/slots.ts — the save slots and which one the next autosave overwrites
// (pure: no DOM, node-runnable)

import { isNum } from '../core/guards.ts';
import type { SaveSummary } from './snapshot.ts';

/** Two autosaves that take turns (the last two are kept), then three slots the player saves into. */
export const AUTO_SLOTS = ['auto-a', 'auto-b'] as const;
export const MANUAL_SLOTS = ['manual-1', 'manual-2', 'manual-3'] as const;
export const SLOT_IDS = [...AUTO_SLOTS, ...MANUAL_SLOTS] as const;

export type SlotId = (typeof SLOT_IDS)[number];

export const isSlotId = (value: unknown): value is SlotId =>
  (SLOT_IDS as readonly unknown[]).includes(value);

/** A slot's line in the load list; stored beside the save so listing never reads the saves. */
export interface SlotMeta {
  id: SlotId;
  savedAt: number;
  version: number;
  mapId: string;
  playSeconds: number;
  summary: SaveSummary;
}

/** Whether a stored row has the fields every slot list reads (a damaged one is left out of the list). */
export function isSlotMeta(value: unknown): value is SlotMeta {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  const s = m.summary as Record<string, unknown> | null | undefined;
  return (
    isSlotId(m.id) &&
    isNum(m.savedAt) &&
    isNum(m.version) &&
    typeof m.mapId === 'string' &&
    isNum(m.playSeconds) &&
    typeof s === 'object' &&
    s !== null &&
    isNum(s.day) &&
    isNum(s.population)
  );
}

export const isAutoSlot = (id: SlotId): boolean => (AUTO_SLOTS as readonly string[]).includes(id);
export const isManualSlot = (id: SlotId): boolean =>
  (MANUAL_SLOTS as readonly string[]).includes(id);

/** An empty autosave slot first, then the older one. */
export function nextAutosaveSlot(metas: readonly SlotMeta[]): (typeof AUTO_SLOTS)[number] {
  const [a, b] = AUTO_SLOTS;
  const savedA = metas.find((m) => m.id === a)?.savedAt;
  const savedB = metas.find((m) => m.id === b)?.savedAt;
  if (savedA === undefined) return a;
  if (savedB === undefined) return b;
  return savedB < savedA ? b : a;
}

/** Newest first (the order Continue tries them in). */
export const newestFirst = (metas: readonly SlotMeta[]): SlotMeta[] =>
  [...metas].sort((p, q) => q.savedAt - p.savedAt);
