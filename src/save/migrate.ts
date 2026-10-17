// src/save/migrate.ts — upgrades an older saved game, one version at a time
// (pure: no DOM, node-runnable)

import { FIRST_SPARKS } from '../skills/skillTree.ts';

export type RawSnapshot = Record<string, unknown>;

/** Turns a snapshot of version n into one of version n + 1 (it need not touch `version` itself). */
export type Migration = (old: RawSnapshot) => RawSnapshot;

/**
 * MIGRATIONS[n] upgrades version n to n + 1. When `SAVE_VERSION` goes up, add the step here in the
 * same change; a save with no path to the current version is refused as corrupt.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: addSkills,
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 1 to 2: the skill tree. A game that had already reached the energy cap (phase 1) would have opened
 * the tree with its first sparks, so its save gets them; any other game starts with a closed tree.
 */
function addSkills(old: RawSnapshot): RawSnapshot {
  const { profile } = old;
  if (!isRecord(profile) || 'skills' in profile) return old;
  const game = profile.game;
  const phase = isRecord(game) && typeof game.phase === 'number' ? game.phase : 0;
  const opened = phase >= 1;
  return {
    ...old,
    profile: { ...profile, skills: { opened, sparks: opened ? FIRST_SPARKS : 0, ranks: {} } },
  };
}

/** Runs the chain from `from` up to `to`; throws when a step is missing or fails. */
export function migrateSnapshot(
  raw: RawSnapshot,
  from: number,
  to: number,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): RawSnapshot {
  let current = raw;
  for (let version = from; version < to; version++) {
    const step = migrations[version];
    if (!step) throw new Error(`no migration from save version ${version} to ${version + 1}`);
    current = { ...step(current), version: version + 1 };
  }
  return current;
}
