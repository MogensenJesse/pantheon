// src/editor/core/raycast.ts — shared NDC + heightfield / object raycasts for editor tools
import { type Camera, type Object3D, type Raycaster, Vector2 } from 'three';
import { WORLD } from '../../config/world';
import {
  type IntersectHeightfieldOptions,
  intersectHeightfieldRay,
} from '../../map/authoring/intersectHeightfieldRay';

const _ndc = new Vector2();

export function clientToNdc(domElement: HTMLElement, clientX: number, clientY: number): Vector2 {
  const rect = domElement.getBoundingClientRect();
  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return _ndc;
}

export type HeightfieldY = (x: number, z: number) => number;

/**
 * How far past the map edge a terrain-brush pick may land. Matches the sculpt
 * radius slider max (400 m) with room for a soft falloff from outside.
 */
export const TERRAIN_BRUSH_PICK_XZ_PAD = 512;

/** Pick world XZ/Y on the authored height grid (not the tessellated editor mesh). */
export function pickHeightfield(
  raycaster: Raycaster,
  camera: Camera,
  getWorldY: HeightfieldY,
  domElement: HTMLElement,
  clientX: number,
  clientY: number,
  options?: IntersectHeightfieldOptions,
): { x: number; y: number; z: number } | null {
  raycaster.setFromCamera(clientToNdc(domElement, clientX, clientY), camera);
  return intersectHeightfieldRay(raycaster.ray, getWorldY, WORLD.SIZE, WORLD.HEIGHT_SCALE, options);
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
