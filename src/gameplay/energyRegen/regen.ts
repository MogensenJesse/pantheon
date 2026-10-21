// src/gameplay/energyRegen/regen.ts — how much energy returns, and where (pure: no DOM, node-runnable)
//
// One rate adds up every source: the shrine zone the orb stands in (only once Attunement is taken)
// and the flat trickle (Renewal), plus the temple and the believers (Devotion). Zones that overlap do not
// stack: the best one counts, and the temple's zone does not stack with a shrine's either.

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
  /** What the temple gives where the orb stands (Devotion), per second; no Attunement needed. */
  templeRate?: number;
  /** What the believers send (Devotion), per second. */
  believerRate?: number;
}

/** A shrine's zone and the temple's do not stack: the better one counts. */
export function regenRate(s: RegenSources): number {
  const place = Math.max(s.attuned > 0 ? s.zoneRate : 0, s.templeRate ?? 0);
  return place + Math.max(0, s.flatPerSec) + Math.max(0, s.believerRate ?? 0);
}

/** Whether (x, z) is within `radiusM` of the temple: the temple restores energy there (Devotion). */
export function templeRateAt(
  temple: { x: number; z: number } | null,
  x: number,
  z: number,
  radiusM: number,
  regenPerSec: number,
): number {
  if (!temple) return 0;
  return Math.hypot(x - temple.x, z - temple.z) <= radiusM ? regenPerSec : 0;
}

/** The energy after `dt` seconds at `rate`, never above the cap. */
export function regenStep(energy: number, cap: number, rate: number, dt: number): number {
  if (rate <= 0 || dt <= 0) return energy;
  return Math.min(cap, energy + rate * dt);
}
