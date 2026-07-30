// src/rendering/sunShadow/stabilizeLightViewShadow.ts — twist-stable light-view texel snap
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { VISUAL } from '../../config/visualTuning';

const _lightPos = new Vector3();
const _focus = new Vector3();
const _z = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _refUp = new Vector3();
const _snapDelta = new Vector3();

/**
 * Rebuild shadow matrices after posing light + target.
 *
 * When `snapFollow` is true and stabilizeShadowMap is on, quantize onto the light-view
 * texel grid (walk stability). Pass **false** for sun-angle-only updates — snapping in a
 * rotating light basis while the follow point is fixed causes sub-texel wrap thrash
 * (penumbra shimmer under a slow day cycle).
 */
export function finalizeShadowLightPose(light: DirectionalLight, snapFollow: boolean): void {
  if (snapFollow && VISUAL.shadows.lighting.stabilizeShadowMap) {
    stabilizeLightViewShadow(light);
    return;
  }
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
}

/**
 * Quantize the directional shadow follow pose onto the shadow-map texel grid in a
 * **twist-stable** light basis, then rebuild shadow matrices.
 *
 * Call after light + target are placed for this frame (continuous follow). Moves
 * light and target together so sun direction is unchanged.
 *
 * Basis matches Three's `lookAt` with world +Y up (swap to +X when looking nearly
 * vertical). That avoids re-axis shiver from a freshly derived, twisting frame under
 * a slow day-cycle sun — the failure mode of naive light-view / projection snaps.
 *
 * Only use on follow / light-distance / full-refresh dirty — not on sun-angle-only
 * frames (see {@link finalizeShadowLightPose}).
 */
export function stabilizeLightViewShadow(light: DirectionalLight): void {
  const shadow = light.shadow;
  const camera = shadow.camera;
  const mapW = Math.max(1, shadow.mapSize.x);
  const mapH = Math.max(1, shadow.mapSize.y);

  const frustumW = camera.right - camera.left;
  const frustumH = camera.top - camera.bottom;
  if (!(frustumW > 0) || !(frustumH > 0)) {
    camera.updateProjectionMatrix();
    shadow.updateMatrices(light);
    return;
  }

  const texelW = frustumW / mapW;
  const texelH = frustumH / mapH;

  light.getWorldPosition(_lightPos);
  light.target.getWorldPosition(_focus);

  // Same z-axis as Matrix4.lookAt(eye, target, up): from target toward light.
  _z.subVectors(_lightPos, _focus);
  if (_z.lengthSq() < 1e-12) {
    camera.updateProjectionMatrix();
    shadow.updateMatrices(light);
    return;
  }
  _z.normalize();

  _refUp.set(0, 1, 0);
  if (Math.abs(_z.dot(_refUp)) > 0.999) {
    _refUp.set(1, 0, 0);
  }

  _right.crossVectors(_refUp, _z).normalize();
  _up.crossVectors(_z, _right).normalize();

  const lightX = _focus.dot(_right);
  const lightY = _focus.dot(_up);
  const dx = Math.round(lightX / texelW) * texelW - lightX;
  const dy = Math.round(lightY / texelH) * texelH - lightY;

  if (dx !== 0 || dy !== 0) {
    _snapDelta.copy(_right).multiplyScalar(dx).addScaledVector(_up, dy);
    light.target.position.add(_snapDelta);
    light.position.add(_snapDelta);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
  }

  camera.updateProjectionMatrix();
  shadow.updateMatrices(light);
}
