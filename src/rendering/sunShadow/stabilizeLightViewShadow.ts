// src/rendering/sunShadow/stabilizeLightViewShadow.ts — twist-stable light-view texel snap
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { computeTwistStableLightBasis } from './twistStableLightBasis';

const _focus = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _snapDelta = new Vector3();
const _basis = { focus: _focus, right: _right, up: _up };

/**
 * Rebuild shadow matrices after posing light + target.
 *
 * Snap only when the light basis is stable (no sun-angle change) — e.g. walk with day
 * cycle frozen. Never snap while the sun rotates: snap + rotating basis thrash soft edges.
 */
export function finalizeShadowLightPose(light: DirectionalLight, snapFollow: boolean): void {
  if (snapFollow) {
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
 * Only when follow / distance / full-refresh is dirty **and** sun angle is unchanged
 * (see {@link finalizeShadowLightPose}).
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

  if (!computeTwistStableLightBasis(light, _basis)) {
    camera.updateProjectionMatrix();
    shadow.updateMatrices(light);
    return;
  }

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
