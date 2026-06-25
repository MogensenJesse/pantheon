// src/rendering/sunShadow/snapSunShadowTarget.ts — texel-grid snap for stable follow shadows
import type { DirectionalLight } from 'three';
import { Matrix4, Vector3 } from 'three';

const _focusWorld = new Vector3();
const _projSnap = new Vector3();
const _projScreenMatrix = new Matrix4();
const _inverseProjScreen = new Matrix4();
const _lightPos = new Vector3();
const _lookTarget = new Vector3();

/**
 * Align the sun shadow follow target to the shadow-map texel grid in light clip space.
 * Stops sub-texel camera motion from swimming across receivers (alpha-cutout props worst).
 */
export function snapSunShadowTargetToTexels(sun: DirectionalLight): void {
  const shadow = sun.shadow;
  const camera = shadow.camera;
  const mapSize = shadow.mapSize.x;
  if (mapSize <= 0) return;

  const frustumW = camera.right - camera.left;
  const frustumH = camera.top - camera.bottom;
  const texelW = frustumW / mapSize;
  const texelH = frustumH / mapSize;
  if (texelW <= 0 || texelH <= 0) return;

  syncSunShadowCameraFromLight(sun);
  camera.updateProjectionMatrix();

  _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  sun.target.getWorldPosition(_focusWorld);
  _projSnap.copy(_focusWorld).applyMatrix4(_projScreenMatrix);

  _projSnap.x = Math.floor(_projSnap.x / texelW + 0.5) * texelW;
  _projSnap.y = Math.floor(_projSnap.y / texelH + 0.5) * texelH;

  _inverseProjScreen.copy(_projScreenMatrix).invert();
  _projSnap.applyMatrix4(_inverseProjScreen);

  sun.target.position.set(_projSnap.x, 0, _projSnap.z);
  sun.target.updateMatrixWorld();
}

/** Mirror LightShadow.updateMatrices camera placement before texel snap. */
export function syncSunShadowCameraFromLight(sun: DirectionalLight): void {
  const camera = sun.shadow.camera;
  _lightPos.setFromMatrixPosition(sun.matrixWorld);
  camera.position.copy(_lightPos);
  _lookTarget.setFromMatrixPosition(sun.target.matrixWorld);
  camera.lookAt(_lookTarget);
  camera.updateMatrixWorld();
}
