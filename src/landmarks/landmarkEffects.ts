// src/landmarks/landmarkEffects.ts — what the places of power do to the village: a hurdle while a place is
// unrestored, a boon once it is (story-mechanics/PHASE_2_RESTORATION.md; the numbers are placeholders)
// (pure: no DOM, node-runnable)
//
// Both are ordinary modifier effects, folded with the skill tree's (see `SkillRuntime.setExtraEffects`). A hurdle
// is below neutral for the village (a multiplier under 1, an addition under 0), a boon above it; storms are the
// other way round (the runestones' hurdle brings more of them, their boon a calmer sky).

import type { LandmarkKind } from '../map/MapTypes.ts';
import type { ModifierEffect } from '../skills/modifiers.ts';
import { isRestored, type LandmarkPlace, type LandmarkState } from './landmarks.ts';

type PlaceEffects = { hurdle: readonly ModifierEffect[]; boon: readonly ModifierEffect[] };

export const LANDMARK_EFFECTS: Record<LandmarkKind, PlaceEffects> = {
  // Drought: fewer storm fronts and less growth from the rain that does come.
  tree: {
    hurdle: [
      { key: 'weatherChanceMul', mul: 0.4 },
      { key: 'rainBoostMul', mul: 0.7 },
    ],
    boon: [
      { key: 'fieldYieldAdd', add: 2 },
      { key: 'stumpWaitMul', mul: 0.7 },
    ],
  },
  // Storms come more often; once the stones stand they are weaker and narrower.
  runestones: {
    hurdle: [{ key: 'weatherChanceMul', mul: 1.6 }],
    boon: [{ key: 'stormStrengthMul', mul: 0.7 }],
  },
  // Unsteady builders.
  temple_ruin: {
    hurdle: [{ key: 'builderRateMul', mul: 0.8 }],
    boon: [
      { key: 'builderRateMul', mul: 1.25 },
      { key: 'bedsPerHouseAdd', add: 1 },
    ],
  },
  // A poor catch.
  sunken_ruin: {
    hurdle: [{ key: 'fishMul', mul: 0.6 }],
    boon: [{ key: 'fishMul', mul: 1.3 }],
  },
  // The faithful waver: a death costs more faith; with the fires lit it costs less and the believers give energy.
  monolith: {
    hurdle: [{ key: 'deathFaithMul', mul: 1.5 }],
    boon: [
      { key: 'deathFaithMul', mul: 0.75 },
      { key: 'energyPerBeliever', add: 0.003 },
    ],
  },
};

/**
 * The effects of the map's places in `state`: the hurdle of each unrestored place while the village is
 * converted (nothing weighs on a village that does not exist yet), the boon of each restored one.
 */
export function landmarkEffects(
  places: readonly LandmarkPlace[],
  state: LandmarkState,
  villageConverted: boolean,
): { effect: ModifierEffect; times: number }[] {
  const out: { effect: ModifierEffect; times: number }[] = [];
  for (const { kind } of places) {
    const list = isRestored(state, kind)
      ? LANDMARK_EFFECTS[kind].boon
      : villageConverted
        ? LANDMARK_EFFECTS[kind].hurdle
        : [];
    for (const effect of list) out.push({ effect, times: 1 });
  }
  return out;
}
