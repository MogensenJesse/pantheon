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
    growth += E.FARMSTEAD.GROWTH_PER_LEVEL * b.level;
    yieldAdd += E.FARMSTEAD.YIELD_PER_LEVEL * b.level;
  }
  out.growthMul = 1 + Math.min(growth, E.FARMSTEAD.MAX_GROWTH_ADD);
  out.yieldAdd = Math.min(yieldAdd, E.FARMSTEAD.MAX_YIELD_ADD);
  return out;
}

/** Faith per second the finished shrines add to the village's income, by their levels (0 with none). */
export function shrineFaith(buildings: readonly Building[]): number {
  let add = 0;
  for (const b of buildings) {
    if (b.type === 'shrine' && isFinished(b)) add += E.SHRINE.FAITH_PER_LEVEL * b.level;
  }
  return Math.min(add, E.SHRINE.MAX_FAITH_ADD);
}

/**
 * Factor on how fast trees are chopped and saplings grow, from the finished workshops' levels: a workshop at
 * level 1 changes nothing, each level above adds `CHOP_PER_LEVEL`.
 */
export function chopMul(buildings: readonly Building[]): number {
  let add = 0;
  for (const b of buildings) {
    if (b.type === 'workshop' && isFinished(b)) add += E.WORKSHOP.CHOP_PER_LEVEL * (b.level - 1);
  }
  return 1 + Math.min(add, E.WORKSHOP.MAX_CHOP_ADD);
}
