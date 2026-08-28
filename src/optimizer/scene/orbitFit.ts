// src/optimizer/scene/orbitFit.ts — fit orbit camera to an AABB (not map-scale limits)
import { Box3, type Object3D, type PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const _box = new Box3();
const _center = new Vector3();
const _size = new Vector3();

export function fitOrbitToObject(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  root: Object3D,
): void {
  _box.setFromObject(root);
  if (_box.isEmpty()) {
    camera.position.set(2, 2, 2);
    controls.target.set(0, 0, 0);
    camera.updateProjectionMatrix();
    controls.update();
    return;
  }
  _box.getCenter(_center);
  _box.getSize(_size);
  const maxDim = Math.max(_size.x, _size.y, _size.z, 0.01);
  const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) + maxDim * 0.2;
  camera.near = Math.max(dist / 200, 0.01);
  camera.far = dist * 40;
  camera.position.set(_center.x + dist * 0.85, _center.y + dist * 0.55, _center.z + dist * 0.85);
  camera.lookAt(_center);
  camera.updateProjectionMatrix();
  controls.target.copy(_center);
  controls.minDistance = dist * 0.15;
  controls.maxDistance = dist * 8;
  controls.update();
}
