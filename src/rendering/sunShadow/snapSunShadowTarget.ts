// src/rendering/sunShadow/snapSunShadowTarget.ts — texel-grid snap for stable follow shadows
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';

const _focusWorld = new Vector3();
const _rightWorld = new Vector3();
const _upWorld = new Vector3();
const _snapDelta = new Vector3();
const _lightPos = new Vector3();
const _lookTarget = new Vector3();

/**
 * Align the sun shadow follow target to the shadow-map texel grid in light-view XY.
 * Recompute this after each continuous sun-direction change so the target stays aligned
 * to the texel grid of the current light frame instead of accumulating sub-texel drift.
 */
export function snapSunShadowTargetToTexels(sun: DirectionalLight): void {
  const shadow = sun.shadow;
  const camera = shadow.camera;
  const mapWidth = shadow.mapSize.x;
  const mapHeight = shadow.mapSize.y;
  if (mapWidth <= 0 || mapHeight <= 0) return;

  const frustumW = camera.right - camera.left;
  const frustumH = camera.top - camera.bottom;
  const texelW = frustumW / mapWidth;
  const texelH = frustumH / mapHeight;
  if (texelW <= 0 || texelH <= 0) return;

  // Camera orientation is translation-invariant for a directional light. Quantize the
  // desired focus along its world-space right/up axes, then move light and target together.
  syncSunShadowCameraFromLight(sun);
  _rightWorld.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  _upWorld.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  sun.target.getWorldPosition(_focusWorld);
  const lightX = _focusWorld.dot(_rightWorld);
  const lightY = _focusWorld.dot(_upWorld);
  const snappedX = Math.round(lightX / texelW) * texelW;
  const snappedY = Math.round(lightY / texelH) * texelH;

  _snapDelta
    .copy(_rightWorld)
    .multiplyScalar(snappedX - lightX)
    .addScaledVector(_upWorld, snappedY - lightY);
  sun.target.position.add(_snapDelta);
  sun.target.updateMatrixWorld();
}

/** Mirror LightShadow.updateMatrices camera placement before texel snap. */
function syncSunShadowCameraFromLight(sun: DirectionalLight): void {
  const camera = sun.shadow.camera;
  _lightPos.setFromMatrixPosition(sun.matrixWorld);
  camera.position.copy(_lightPos);
  _lookTarget.setFromMatrixPosition(sun.target.matrixWorld);
  camera.lookAt(_lookTarget);
  camera.updateMatrixWorld();
}
