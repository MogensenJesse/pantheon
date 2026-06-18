// src/editor/core/raycast.ts — shared NDC + terrain/object raycasts for editor tools
import { type Camera, type Object3D, type Raycaster, Vector2 } from 'three';

const _ndc = new Vector2();

export function clientToNdc(domElement: HTMLElement, clientX: number, clientY: number): Vector2 {
  const rect = domElement.getBoundingClientRect();
  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return _ndc;
}

export function raycastTerrain(
  raycaster: Raycaster,
  camera: Camera,
  terrain: Object3D,
  domElement: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number; z: number } | null {
  raycaster.setFromCamera(clientToNdc(domElement, clientX, clientY), camera);
  const hits = raycaster.intersectObject(terrain, true);
  if (!hits.length) return null;
  const p = hits[0].point;
  return { x: p.x, y: p.y, z: p.z };
}

export function raycastObjects(
  raycaster: Raycaster,
  camera: Camera,
  objects: Object3D[],
  domElement: HTMLElement,
  clientX: number,
  clientY: number,
  recursive = true,
): import('three').Intersection[] {
  raycaster.setFromCamera(clientToNdc(domElement, clientX, clientY), camera);
  return raycaster.intersectObjects(objects, recursive);
}
