// src/world/village/sim/belief.ts — who believes, and when the village counts as converted (pure)
//
// Belief runs 0..1 per villager; at 1 they believe (a convert). The hamlet is converted when the elder
// believes and at least `CONVERT_SHARE` of the village does (the elder counts among them). This is the
// provisional rule: the quest chain (M2c) takes over the last step.

import { VILLAGE } from '../../../config/village.ts';

const { HAMLET } = VILLAGE;

/** How many villagers must believe, the elder included, for a village of `count`. */
export function requiredBelievers(count: number, share: number = HAMLET.CONVERT_SHARE): number {
  return Math.max(1, Math.ceil(count * share));
}

export function countBelievers(belief: ArrayLike<number>, count: number): number {
  let n = 0;
  for (let i = 0; i < count; i++) if (belief[i]! >= 1) n++;
  return n;
}

/** Share of the village that believes, 0..1 (0 for an empty village). */
export function beliefShare(belief: ArrayLike<number>, count: number): number {
  return count > 0 ? countBelievers(belief, count) / count : 0;
}

/** The provisional conversion rule. `elder` is a villager index or -1. */
export function isVillageConverted(
  belief: ArrayLike<number>,
  count: number,
  elder: number,
): boolean {
  if (elder < 0 || elder >= count || belief[elder]! < 1) return false;
  return countBelievers(belief, count) >= requiredBelievers(count);
}

/** Raises one villager's belief (clamped to 0..1); true when it just reached 1. */
export function raiseBelief(belief: Float32Array, index: number, amount: number): boolean {
  const before = belief[index]!;
  belief[index] = Math.min(1, Math.max(0, before + amount));
  return before < 1 && belief[index]! >= 1;
}

/** Sparks a convert is worth: one each after the first few. `converts` counts the new one. */
export function sparksForConvert(converts: number): number {
  return converts > HAMLET.SPARK_AFTER_CONVERTS ? 1 : 0;
}

/** Sparks the conversion of the whole village is worth. */
export const SPARKS_AT_CONVERSION = HAMLET.SPARKS_AT_CONVERSION;

/** The faith income of a hamlet: believers times the per-believer rate (0 before the first convert). */
export function believerIncome(believers: number): number {
  return believers * VILLAGE.FAITH.PER_BELIEVER_PER_SEC;
}
