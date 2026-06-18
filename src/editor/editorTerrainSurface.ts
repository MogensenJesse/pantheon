// src/editor/editorTerrainSurface.ts — sample visible editor terrain height at world XZ
import { Box3, type Object3D, Raycaster, Vector3 } from 'three';
import type { MapTerrainContext } from '../world/MapTerrainBuilder';

const _rayOrigin = new Vector3();
const _rayDir = new Vector3(0, -1, 0);
const _raycaster = new Raycaster();
const _bounds = new Box3();

/**
 * World Y on the editor terrain mesh at (x, z). Raycasts the CPU-displaced mesh so
 * props match the sculpted surface; falls back to the height grid when no hit.
 */
export function sampleEditorTerrainSurfaceY(
  terrain: Pick<MapTerrainContext, 'mesh' | 'getWorldY'>,
  x: number,
  z: number,
): number {
  _rayOrigin.set(x, 4096, z);
  _raycaster.set(_rayOrigin, _rayDir);
  const hits = _raycaster.intersectObject(terrain.mesh, true);
  if (hits.length > 0) return hits[0].point.y;
  return terrain.getWorldY(x, z);
}

/** Shift object so the bottom of its world bounds sits on surfaceY. */
export function alignObjectBaseToSurface(obj: Object3D, surfaceY: number): void {
  obj.updateMatrixWorld(true);
  _bounds.setFromObject(obj);
  if (_bounds.isEmpty()) return;
  const lift = surfaceY - _bounds.min.y;
  obj.position.y += lift;
}

/** Surface Y plus optional authored lift (play-mode `surfaceLift` on props). */
export function propSurfaceY(
  terrain: Pick<MapTerrainContext, 'mesh' | 'getWorldY'>,
  x: number,
  z: number,
  surfaceLift = 0,
): number {
  return sampleEditorTerrainSurfaceY(terrain, x, z) + surfaceLift;
}
