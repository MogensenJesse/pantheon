// src/rendering/sunShadow/nearCascadeHandoffUniforms.ts — light-view near→far cascade mix
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { computeTwistStableLightBasis } from './twistStableLightBasis';

const near = VISUAL.shadows.lighting.near;

const _focus = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _basis = { focus: _focus, right: _right, up: _up };

/**
 * Near cascade handoff — matches the ortho square (±halfExtent in light-view XY),
 * not a world-XZ circle (that mismatch caused a lit dead zone between near and far).
 *
 * Written every frame from {@link updateNearCascadeShadowTarget}.
 */
export const nearCascadeHandoffUniforms = {
  uNearShadowFocus: uniform(new Vector3()),
  uNearLightRight: uniform(new Vector3(1, 0, 0)),
  uNearLightUp: uniform(new Vector3(0, 0, 1)),
  uNearHalfExtentM: uniform(near.halfExtentM),
  uNearFadeBandM: uniform(near.fadeBandM),
};

/**
 * Sync focus + twist-stable light basis (same lookAt/+Y-up as shadow snap) for edge fade.
 */
export function syncNearCascadeHandoffFromLight(light: DirectionalLight): void {
  if (!computeTwistStableLightBasis(light, _basis)) {
    _focus.set(0, 0, 0);
    _right.set(1, 0, 0);
    _up.set(0, 0, 1);
  }

  (nearCascadeHandoffUniforms.uNearShadowFocus.value as Vector3).copy(_focus);
  (nearCascadeHandoffUniforms.uNearLightRight.value as Vector3).copy(_right);
  (nearCascadeHandoffUniforms.uNearLightUp.value as Vector3).copy(_up);
  nearCascadeHandoffUniforms.uNearHalfExtentM.value = VISUAL.shadows.lighting.near.halfExtentM;
  nearCascadeHandoffUniforms.uNearFadeBandM.value = VISUAL.shadows.lighting.near.fadeBandM;
}
