// src/gameplay/landmarkBoons.ts — what restoring a place of power gives the village
//
// The hurdles begin when the village converts, a restored place lifts its hurdle and gives its boon and a
// lump of faith (the effects: landmarks/landmarkEffects.ts, folded with the skill tree's by the skill runtime).

import { VILLAGE } from '../config/village';
import { bus } from '../core/EventBus';
import { landmarkEffects } from '../landmarks/landmarkEffects';
import type { LandmarkRuntime } from '../landmarks/landmarkRuntime';
import type { SkillRuntime } from '../skills/skillRuntime';
import type { VillageSystemContext } from '../world/village/VillageSystem';

export interface LandmarkBoonsDeps {
  landmarks: Pick<LandmarkRuntime, 'places' | 'state'>;
  skills: Pick<SkillRuntime, 'setExtraEffects'>;
  /** Null when the map has no village. */
  village: Pick<VillageSystemContext, 'addFaith' | 'sim'> | null;
}

/** Wires the hurdles, boons and the faith lump; returns the teardown. */
export function initLandmarkBoons(deps: LandmarkBoonsDeps): () => void {
  const refresh = () =>
    deps.skills.setExtraEffects(
      deps.village
        ? landmarkEffects(deps.landmarks.places, deps.landmarks.state(), deps.village.sim.converted)
        : [],
    );
  refresh();
  const offConverted = bus.on('village:converted', refresh);
  const offRestored = bus.on('landmark:restored', () => {
    deps.village?.addFaith(VILLAGE.RESTORATION.RESTORE_FAITH);
    refresh();
  });
  return () => {
    offConverted();
    offRestored();
  };
}
