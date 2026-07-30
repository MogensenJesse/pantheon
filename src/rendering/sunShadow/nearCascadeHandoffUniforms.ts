// src/rendering/sunShadow/nearCascadeHandoffUniforms.ts — light-view near→far cascade mix
import { Vector3 } from 'three';
import type { DirectionalLight } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

const near = VISUAL.shadows.lighting.near;

const _lightPos = new Vector3();
const _focus = new Vector3();
const _z = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _refUp = new Vector3();

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
  light.getWorldPosition(_lightPos);
  light.target.getWorldPosition(_focus);

  _z.subVectors(_lightPos, _focus);
  if (_z.lengthSq() < 1e-12) {
    _z.set(0, 1, 0);
  } else {
    _z.normalize();
  }

  _refUp.set(0, 1, 0);
  if (Math.abs(_z.dot(_refUp)) > 0.999) {
    _refUp.set(1, 0, 0);
  }

  _right.crossVectors(_refUp, _z).normalize();
  _up.crossVectors(_z, _right).normalize();

  (nearCascadeHandoffUniforms.uNearShadowFocus.value as Vector3).copy(_focus);
  (nearCascadeHandoffUniforms.uNearLightRight.value as Vector3).copy(_right);
  (nearCascadeHandoffUniforms.uNearLightUp.value as Vector3).copy(_up);
  nearCascadeHandoffUniforms.uNearHalfExtentM.value = VISUAL.shadows.lighting.near.halfExtentM;
  nearCascadeHandoffUniforms.uNearFadeBandM.value = VISUAL.shadows.lighting.near.fadeBandM;
}
