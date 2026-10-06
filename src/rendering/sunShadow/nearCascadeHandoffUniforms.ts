// src/rendering/sunShadow/nearCascadeHandoffUniforms.ts — light-view near→far cascade mix
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { syncLightBasisUniforms } from './twistStableLightBasis';

const near = VISUAL.shadows.lighting.near;

/**
 * The handoff matches the ortho square (±halfExtent in light-view XY), not a world-XZ circle.
 * Focus is the near light target (player XZ + terrain Y); the basis is refreshed by
 * {@link syncNearCascadeHandoffFromLight}.
 */
export const nearCascadeHandoffUniforms = {
  uNearShadowFocus: uniform(new Vector3()),
  uNearLightRight: uniform(new Vector3(1, 0, 0)),
  uNearLightUp: uniform(new Vector3(0, 0, 1)),
  uNearHalfExtentM: uniform(near.halfExtentM),
  uNearFadeBandM: uniform(near.fadeBandM),
};

/** Follow the near light's focus + twist-stable basis (same frame as the texel snap). */
export function syncNearCascadeHandoffFromLight(light: DirectionalLight): void {
  syncLightBasisUniforms(light, {
    focus: nearCascadeHandoffUniforms.uNearShadowFocus,
    right: nearCascadeHandoffUniforms.uNearLightRight,
    up: nearCascadeHandoffUniforms.uNearLightUp,
  });
}
