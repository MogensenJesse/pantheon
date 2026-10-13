// src/rendering/sunShadow/cloudCastHandoffUniforms.ts — light-view edge fade of the cloud-cast square
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { syncLightBasisUniforms } from './twistStableLightBasis';

const half = VISUAL.clouds.castShadowHalfM;

/**
 * Receivers fade cloud shadow out over the last quarter of the cast map's ortho square, so its
 * edge is not a straight cutoff on the ground. Focus + basis follow the cloud-cast light.
 */
export const cloudCastHandoffUniforms = {
  uCloudShadowFocus: uniform(new Vector3()),
  uCloudLightRight: uniform(new Vector3(1, 0, 0)),
  uCloudLightUp: uniform(new Vector3(0, 0, 1)),
  uCloudHalfExtentM: uniform(half),
  uCloudFadeBandM: uniform(half * 0.25),
};

/** Follow the cloud-cast light's focus + twist-stable basis (same frame as the texel snap). */
export function syncCloudCastHandoffFromLight(light: DirectionalLight): void {
  syncLightBasisUniforms(light, {
    focus: cloudCastHandoffUniforms.uCloudShadowFocus,
    right: cloudCastHandoffUniforms.uCloudLightRight,
    up: cloudCastHandoffUniforms.uCloudLightUp,
  });
}
