// src/save/saveService.ts — saving, loading and Continue over a store (pure apart from the store)

import type { Migration } from './migrate.ts';
import { newestFirst, nextAutosaveSlot, type SlotId, type SlotMeta } from './slots.ts';
import {
  parseSnapshot,
  SAVE_VERSION,
  type SaveRefusal,
  type SaveSlice,
  type SaveSnapshot,
  type SaveSummary,
} from './snapshot.ts';
import { SaveError, type SaveStore } from './store.ts';

/** What the game hands over to be saved; the service adds the version, time and map. */
export interface SaveParts {
  playSeconds: number;
  summary: SaveSummary;
  profile: SaveSlice;
  village: SaveSlice;
}

export type LoadFailure = SaveRefusal | 'empty' | 'unavailable' | 'failed';

export interface Skipped {
  slot: SlotId;
  reason: LoadFailure;
  message: string;
}

export type LoadResult =
  | {
      ok: true;
      slot: SlotId;
      snapshot: SaveSnapshot;
      /** The version the save was upgraded from, or null when it was current. */
      migratedFrom: number | null;
      /** Newer slots Continue passed over because they could not be loaded. */
      skipped: Skipped[];
    }
  | { ok: false; reason: LoadFailure; message: string; skipped: Skipped[] };

export interface SaveService {
  list: () => Promise<SlotMeta[]>;
  /** Writes into a slot; rejects with a `SaveError` and leaves the slot as it was when that fails. */
  save: (slot: SlotId, parts: SaveParts) => Promise<SlotMeta>;
  /** Writes into the older of the two autosave slots. */
  autosave: (parts: SaveParts) => Promise<SlotMeta>;
  load: (slot: SlotId) => Promise<LoadResult>;
  /** Continue: the newest slot that loads, passing over (and reporting) any that do not. */
  loadLatest: () => Promise<LoadResult>;
  remove: (slot: SlotId) => Promise<void>;
}

export interface SaveServiceOptions {
  /** The map this session runs on. */
  mapId: string;
  now?: () => number;
  /** Replace the real version and chain (tests). */
  currentVersion?: number;
  migrations?: Readonly<Record<number, Migration>>;
}

export function createSaveService(store: SaveStore, o: SaveServiceOptions): SaveService {
  const now = o.now ?? Date.now;
  const version = o.currentVersion ?? SAVE_VERSION;
  const parseOptions = { mapId: o.mapId, migrations: o.migrations, currentVersion: version };

  const save = async (slot: SlotId, parts: SaveParts): Promise<SlotMeta> => {
    const snapshot: SaveSnapshot = {
      version,
      savedAt: now(),
      playSeconds: parts.playSeconds,
      mapId: o.mapId,
      summary: parts.summary,
      profile: parts.profile,
      village: parts.village,
    };
    // A save we would refuse to load is a bug in the caller, so it never reaches the disk.
    const check = parseSnapshot(snapshot, parseOptions);
    if (!check.ok)
      throw new SaveError('failed', `Refusing to write an invalid save: ${check.message}`);
    const meta: SlotMeta = {
      id: slot,
      savedAt: snapshot.savedAt,
      version,
      mapId: o.mapId,
      playSeconds: snapshot.playSeconds,
      summary: snapshot.summary,
    };
    await store.write(meta, snapshot);
    return meta;
  };

  const load = async (slot: SlotId): Promise<LoadResult> => {
    let raw: unknown;
    try {
      raw = await store.read(slot);
    } catch (err) {
      const code = err instanceof SaveError ? err.code : 'failed';
      const message = err instanceof Error ? err.message : 'Could not read the save.';
      return {
        ok: false,
        reason: code === 'unavailable' ? 'unavailable' : 'failed',
        message,
        skipped: [],
      };
    }
    if (raw === null)
      return { ok: false, reason: 'empty', message: 'This slot is empty.', skipped: [] };
    const parsed = parseSnapshot(raw, parseOptions);
    if (!parsed.ok)
      return { ok: false, reason: parsed.reason, message: parsed.message, skipped: [] };
    return {
      ok: true,
      slot,
      snapshot: parsed.snapshot,
      migratedFrom: parsed.migratedFrom,
      skipped: [],
    };
  };

  return {
    list: () => store.list(),
    save,
    autosave: async (parts) => save(nextAutosaveSlot(await store.list()), parts),
    load,
    loadLatest: async () => {
      const skipped: Skipped[] = [];
      for (const meta of newestFirst(await store.list())) {
        const result = await load(meta.id);
        if (result.ok) return { ...result, skipped };
        skipped.push({ slot: meta.id, reason: result.reason, message: result.message });
      }
      const first = skipped[0];
      return first
        ? { ok: false, reason: first.reason, message: first.message, skipped }
        : { ok: false, reason: 'empty', message: 'There is no saved game yet.', skipped };
    },
    remove: (slot) => store.remove(slot),
  };
}
