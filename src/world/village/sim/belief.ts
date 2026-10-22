// src/world/village/sim/belief.ts — who believes, and what belief is worth (pure)
//
// Belief runs 0..1 per villager; at 1 they believe (a convert). What converts the village is the quest
// chain (src/quests); the sim only counts.

import { VILLAGE } from '../../../config/village.ts';
import { clamp01 } from '../../../core/math/scalar.ts';

/** A villager believes (their belief is whole) and is not dying. */
export const believes = (belief: ArrayLike<number>, dying: ArrayLike<number>, i: number): boolean =>
  belief[i]! >= 1 && dying[i]! <= 0;

export function countBelievers(belief: ArrayLike<number>, count: number): number {
  let n = 0;
  for (let i = 0; i < count; i++) if (belief[i]! >= 1) n++;
  return n;
}

/** Share of the village that believes, 0..1 (0 for an empty village). */
export function beliefShare(belief: ArrayLike<number>, count: number): number {
  return count > 0 ? countBelievers(belief, count) / count : 0;
}

/** Raises one villager's belief (clamped to 0..1); true when it just reached 1. */
export function raiseBelief(belief: Float32Array, index: number, amount: number): boolean {
  const before = belief[index]!;
  belief[index] = clamp01(before + amount);
  return before < 1 && belief[index]! >= 1;
}

/** The faith income of a hamlet: believers times the per-believer rate (0 before the first convert). */
export function believerIncome(believers: number): number {
  return believers * VILLAGE.FAITH.PER_BELIEVER_PER_SEC;
}
