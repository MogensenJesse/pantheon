// src/save/snapshot.ts — the shape of one saved game and the rules for accepting a stored one
// (pure: no DOM, node-runnable)

import { type Migration, migrateSnapshot, type RawSnapshot } from './migrate.ts';

/** Bump when the shape of a saved game changes, and add the step to `MIGRATIONS` (migrate.ts). */
export const SAVE_VERSION = 1;

/**
 * One system's saved state: plain data that survives structured clone (numbers, strings, arrays,
 * typed arrays, nested records; no functions). Each milestone tightens its own slice's type.
 */
export type SaveSlice = Record<string, unknown>;

/** What the slot list shows without loading the whole save. */
export interface SaveSummary {
  /** Game days played. */
  day: number;
  population: number;
  /** Small data URL, or null until a thumbnail can be taken. */
  thumbnail: string | null;
}

export interface SaveSnapshot {
  version: number;
  /** Date.now() at the time of saving. */
  savedAt: number;
  playSeconds: number;
  /** The map this game runs on: a save from another map is refused. */
  mapId: string;
  summary: SaveSummary;
  /** The player and the world clock: GameState, unlocks, orbs, quests. */
  profile: SaveSlice;
  /** The village: faith, buildings, fields, villagers, paths, wear, stock, trees, graves, RNG. */
  village: SaveSlice;
}

export type SaveRefusal = 'corrupt' | 'newer-version' | 'other-map';

export type ParseResult =
  | { ok: true; snapshot: SaveSnapshot; migratedFrom: number | null }
  | { ok: false; reason: SaveRefusal; message: string };

export interface ParseOptions {
  /** The map this session runs on. */
  mapId: string;
  /** Replaces the real chain (tests). */
  migrations?: Readonly<Record<number, Migration>>;
  /** Replaces `SAVE_VERSION` (tests). */
  currentVersion?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function isSummary(value: unknown): value is SaveSummary {
  return (
    isRecord(value) &&
    isCount(value.day) &&
    isCount(value.population) &&
    (value.thumbnail === null || typeof value.thumbnail === 'string')
  );
}

function isSnapshot(
  value: Record<string, unknown>,
): value is Record<string, unknown> & SaveSnapshot {
  return (
    isCount(value.savedAt) &&
    isCount(value.playSeconds) &&
    typeof value.mapId === 'string' &&
    value.mapId.length > 0 &&
    isSummary(value.summary) &&
    isRecord(value.profile) &&
    isRecord(value.village)
  );
}

const corrupt = (message: string): ParseResult => ({ ok: false, reason: 'corrupt', message });

/**
 * Accepts a stored value as a saved game of the current version, or says why not. Older versions are
 * upgraded; a newer version, a different map or a damaged value is refused (the caller keeps the
 * previous save).
 */
export function parseSnapshot(raw: unknown, options: ParseOptions): ParseResult {
  const current = options.currentVersion ?? SAVE_VERSION;
  if (!isRecord(raw)) return corrupt('The save is not readable.');
  const { version } = raw;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return corrupt('The save has no valid version.');
  }
  if (version > current) {
    return {
      ok: false,
      reason: 'newer-version',
      message: 'This save was made by a newer version of the game.',
    };
  }
  let upgraded: RawSnapshot = raw;
  if (version < current) {
    try {
      upgraded = migrateSnapshot(raw, version, current, options.migrations);
    } catch {
      return corrupt('The save is too old to upgrade.');
    }
  }
  if (!isSnapshot(upgraded)) return corrupt('The save is incomplete.');
  if (upgraded.mapId !== options.mapId) {
    return {
      ok: false,
      reason: 'other-map',
      message: `This save belongs to another map (${upgraded.mapId}).`,
    };
  }
  return { ok: true, snapshot: upgraded, migratedFrom: version < current ? version : null };
}
