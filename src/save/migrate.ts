// src/save/migrate.ts — upgrades an older saved game, one version at a time
// (pure: no DOM, node-runnable)
//
// There are no steps yet: saves from before version 5 were dropped on purpose (nothing worth keeping
// existed), so a save older than `SAVE_VERSION` is refused as too old. The chain stays so the next
// version bump can add its step; without one, that bump breaks every existing save.

export type RawSnapshot = Record<string, unknown>;

/** Turns a snapshot of version n into one of version n + 1 (it need not touch `version` itself). */
export type Migration = (old: RawSnapshot) => RawSnapshot;

/**
 * MIGRATIONS[n] upgrades version n to n + 1. When `SAVE_VERSION` goes up, add the step here in the
 * same change; a save with no path to the current version is refused as too old.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** Whether every step from `from` up to `to` exists. */
export function canMigrate(
  from: number,
  to: number,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): boolean {
  for (let version = from; version < to; version++) if (!migrations[version]) return false;
  return true;
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
