// src/rendering/sunShadow/worldCascadeHandoffUniforms.ts — far (±200 m) → world cascade handoff
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { SUN_SHADOW_FAR_FOLLOW_HALF_M } from './shadowFollowConstants';
import { syncLightBasisUniforms } from './twistStableLightBasis';

/**
 * The handoff square is the far map's ortho square (light-view XY of the main sun), not a
 * world-XZ circle. Focus + basis are refreshed per frame by {@link syncWorldHandoffBasis}.
 */
export const worldCascadeHandoffUniforms = {
  uFarShadowFocus: uniform(new Vector3()),
  uFarLightRight: uniform(new Vector3(1, 0, 0)),
  uFarLightUp: uniform(new Vector3(0, 0, 1)),
  uFarHalfExtentM: uniform(SUN_SHADOW_FAR_FOLLOW_HALF_M),
  uWorldFadeBandM: uniform(VISUAL.shadows.lighting.world.fadeBandM),
  /** 1 = near/far zone also takes world casters those maps clip; DEV views set 0. */
  uWorldDistantWeight: uniform(1),
};

/** Follow the far sun's focus + light-view basis (call after its pose update). */
export function syncWorldHandoffBasis(sun: DirectionalLight): void {
  syncLightBasisUniforms(sun, {
    focus: worldCascadeHandoffUniforms.uFarShadowFocus,
    right: worldCascadeHandoffUniforms.uFarLightRight,
    up: worldCascadeHandoffUniforms.uFarLightUp,
  });
}
