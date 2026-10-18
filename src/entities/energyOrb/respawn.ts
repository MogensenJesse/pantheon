// src/entities/energyOrb/respawn.ts — when and where a picked-up orb comes back (pure: no DOM, no
// three, node-runnable)
//
// A rule, not a skill: once the skill tree has opened, picked-up orbs return at semi-random places.
// The clock only runs while the tree is open and fewer orbs are alive than the cap; a spot must be
// walkable, away from the player, away from live orbs and out of the keep-clear zones, and half of the
// time it is near a shrine.

import { PHASE0 } from '../../config/phase0.ts';

/** The respawn tunables: `PHASE0.RESPAWN` starts them, and the DEV tools may change a live copy. */
export type RespawnConfig = { -readonly [K in keyof typeof PHASE0.RESPAWN]: number };

export interface Point {
  x: number;
  z: number;
}

export interface SpotQuery {
  rng: () => number;
  player: Point;
  liveOrbs: readonly Point[];
  shrines: readonly Point[];
  /** The area spots are drawn from. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  isWalkable: (x: number, z: number) => boolean;
  /** Discs to keep clear (the village). */
  avoid?: readonly (Point & { radiusM: number })[];
  config?: RespawnConfig;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** A fitting spot, or null when none was found in `config.MAX_TRIES` tries. */
export function pickRespawnSpot(q: SpotQuery): Point | null {
  const c = q.config ?? PHASE0.RESPAWN;
  const { minX, maxX, minZ, maxZ } = q.bounds;
  for (let i = 0; i < c.MAX_TRIES; i++) {
    let x: number;
    let z: number;
    if (q.shrines.length > 0 && q.rng() < c.SHRINE_BIAS) {
      const shrine =
        q.shrines[Math.min(q.shrines.length - 1, Math.floor(q.rng() * q.shrines.length))]!;
      const angle = q.rng() * Math.PI * 2;
      // sqrt keeps the spots even over the ring's area instead of piling up near its inner edge.
      const r = Math.sqrt(
        c.SHRINE_MIN_M ** 2 + q.rng() * (c.SHRINE_MAX_M ** 2 - c.SHRINE_MIN_M ** 2),
      );
      x = shrine.x + Math.cos(angle) * r;
      z = shrine.z + Math.sin(angle) * r;
    } else {
      x = minX + q.rng() * (maxX - minX);
      z = minZ + q.rng() * (maxZ - minZ);
    }
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const here = { x, z };
    if (dist(here, q.player) < c.MIN_PLAYER_DIST_M) continue;
    if (q.liveOrbs.some((o) => dist(here, o) < c.MIN_ORB_DIST_M)) continue;
    if (q.avoid?.some((a) => dist(here, a) < a.radiusM)) continue;
    if (!q.isWalkable(x, z)) continue;
    return here;
  }
  return null;
}

/** The orb energy value of a respawned orb: a whole number from the same range as authored orbs. */
export function respawnEnergy(rng: () => number): number {
  const { ENERGY_MIN, ENERGY_MAX } = PHASE0.ORB;
  return ENERGY_MIN + Math.floor(rng() * (ENERGY_MAX - ENERGY_MIN));
}

/** One of `count` slots, at random. */
export function pickSlot(rng: () => number, count: number): number {
  return Math.min(count - 1, Math.floor(rng() * count));
}

export interface RespawnClock {
  remainingSec: number;
}

export function newRespawnClock(config: RespawnConfig = PHASE0.RESPAWN): RespawnClock {
  return { remainingSec: config.INTERVAL_SEC };
}

export interface ClockContext {
  /** The skill tree has opened. */
  open: boolean;
  /** Orbs alive now. */
  live: number;
  /** Slots with no live orb. */
  free: number;
  config?: RespawnConfig;
}

/** Retry sooner than a full interval when no spot was found. */
export const RETRY_SEC = 15;

/**
 * Runs the clock `dt` seconds. True when an orb is due. The clock only runs while the tree is open,
 * there is a free slot and fewer than the cap are alive; otherwise it stays full, so a slot starts its
 * wait from the moment it becomes due to return.
 */
export function stepRespawn(clock: RespawnClock, dt: number, ctx: ClockContext): boolean {
  const c = ctx.config ?? PHASE0.RESPAWN;
  if (!ctx.open || ctx.free <= 0 || ctx.live >= c.MAX_LIVE) {
    clock.remainingSec = c.INTERVAL_SEC;
    return false;
  }
  clock.remainingSec -= dt;
  if (clock.remainingSec > 0) return false;
  clock.remainingSec = c.INTERVAL_SEC;
  return true;
}

/** The pick found nothing: try again soon. */
export function retrySoon(clock: RespawnClock, config: RespawnConfig = PHASE0.RESPAWN): void {
  clock.remainingSec = Math.min(RETRY_SEC, config.INTERVAL_SEC);
}
