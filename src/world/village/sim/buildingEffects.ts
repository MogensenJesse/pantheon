// src/world/village/sim/buildingEffects.ts — what finished buildings and their levels do for the village
// (pure: no DOM, node-runnable)
//
// Everything here is derived from the buildings as they stand, asked fresh each step, so none of it is saved and
// a village without these buildings plays exactly as it did before: every bonus is 0 and every factor 1.

import { VILLAGE } from '../../../config/village.ts';
import { distXZ } from '../../../core/math/geom.ts';
import { isFinished } from '../model/buildings.ts';
import type { Building, Field } from '../model/types.ts';

const E = VILLAGE.EFFECTS;

// What one building of a level gives, before the caps buildings stack up to. The sums below and the overview's
// panel both read these, so the panel can never say something else than the sim does.

/** Growth speed (a share: 0.25 is a quarter faster) one farmstead of `level` adds to each field in its reach. */
export const farmsteadGrowth = (level: number): number => E.FARMSTEAD.GROWTH_PER_LEVEL * level;
/** Food one farmstead of `level` adds to each harvest of a field in its reach. */
export const farmsteadYield = (level: number): number => E.FARMSTEAD.YIELD_PER_LEVEL * level;
/** Faith per second one shrine of `level` adds to the income (before the cap and the faith multiplier). */
export const shrineShare = (level: number): number => E.SHRINE.FAITH_PER_LEVEL * level;
/** Share of chopping speed one workshop of `level` adds: a level-1 workshop adds nothing. */
export const workshopShare = (level: number): number => E.WORKSHOP.CHOP_PER_LEVEL * (level - 1);

/** What the farmsteads around a field do for it. */
export interface FieldBonus {
  /** Factor on the field's growth speed (1 when no farmstead reaches it). */
  growthMul: number;
  /** Food added to a harvest of the field (0 when none). */
  yieldAdd: number;
}

/** The effect of the finished farmsteads whose reach includes `field`, written to `out` (no allocation). */
export function fieldBonus(
  field: Pick<Field, 'x' | 'z'>,
  buildings: readonly Building[],
  out: FieldBonus,
): FieldBonus {
  let growth = 0;
  let yieldAdd = 0;
  for (const b of buildings) {
    if (b.type !== 'farmstead' || !isFinished(b)) continue;
    if (distXZ(b.x, b.z, field.x, field.z) > E.FARMSTEAD.RADIUS_M) continue;
    growth += farmsteadGrowth(b.level);
    yieldAdd += farmsteadYield(b.level);
  }
  out.growthMul = 1 + Math.min(growth, E.FARMSTEAD.MAX_GROWTH_ADD);
  out.yieldAdd = Math.min(yieldAdd, E.FARMSTEAD.MAX_YIELD_ADD);
  return out;
}

/** The sum of `share(level)` over the finished buildings of `type`. */
function sumFinished(
  buildings: readonly Building[],
  type: Building['type'],
  share: (level: number) => number,
): number {
  let sum = 0;
  for (const b of buildings) {
    if (b.type === type && isFinished(b)) sum += share(b.level);
  }
  return sum;
}

/** Faith per second the finished shrines add to the village's income, by their levels (0 with none). */
export function shrineFaith(buildings: readonly Building[]): number {
  return Math.min(sumFinished(buildings, 'shrine', shrineShare), E.SHRINE.MAX_FAITH_ADD);
}

/**
 * Factor on how fast trees are chopped and saplings grow, from the finished workshops' levels: a workshop at
 * level 1 changes nothing, each level above adds `CHOP_PER_LEVEL`.
 */
export function chopMul(buildings: readonly Building[]): number {
  return 1 + Math.min(sumFinished(buildings, 'workshop', workshopShare), E.WORKSHOP.MAX_CHOP_ADD);
}
