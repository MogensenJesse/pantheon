// src/entities/shrine/regen.ts — how much energy returns, and where (pure: no DOM, node-runnable)
//
// One rate adds up every source: the shrine zone the orb stands in (only once Attunement is taken)
// and the flat trickle (Renewal). Zones that overlap do not stack: the best one counts. Later sources
// (believers in M2, the temple in M9) add a term here.

import { PHASE0 } from '../../config/phase0.ts';

/** A shrine's zone, with its defaults filled in. */
export interface ShrineZone {
  x: number;
  z: number;
  radiusM: number;
  regenPerSec: number;
}

/** The authored fields of a shrine entity (all but the place are optional). */
export interface ShrineSource {
  x: number;
  z: number;
  radiusM?: number;
  regenPerSec?: number;
}

export function toZone(shrine: ShrineSource): ShrineZone {
  return {
    x: shrine.x,
    z: shrine.z,
    radiusM: shrine.radiusM ?? PHASE0.SHRINE.RADIUS_M,
    regenPerSec: shrine.regenPerSec ?? PHASE0.SHRINE.REGEN_PER_SEC,
  };
}

/** Energy per second the zones give at a point: the best one that contains it, or 0. */
export function zoneRateAt(zones: readonly ShrineZone[], x: number, z: number): number {
  let best = 0;
  for (const zone of zones) {
    if (Math.hypot(x - zone.x, z - zone.z) <= zone.radiusM) best = Math.max(best, zone.regenPerSec);
  }
  return best;
}

export interface RegenSources {
  /** What the zones give where the orb stands. */
  zoneRate: number;
  /** Attunement taken (1) or not (0). */
  attuned: number;
  /** Renewal's trickle, per second. */
  flatPerSec: number;
}

export function regenRate(s: RegenSources): number {
  return (s.attuned > 0 ? s.zoneRate : 0) + Math.max(0, s.flatPerSec);
}

/** The energy after `dt` seconds at `rate`, never above the cap. */
export function regenStep(energy: number, cap: number, rate: number, dt: number): number {
  if (rate <= 0 || dt <= 0) return energy;
  return Math.min(cap, energy + rate * dt);
}
