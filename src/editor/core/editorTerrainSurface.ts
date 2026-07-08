// src/editor/core/editorTerrainSurface.ts — sample visible editor terrain height at world XZ
import { Box3, type Object3D, Raycaster, Vector3 } from 'three';
import { VISUAL } from '../../config/visualTuning';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import {
  sampleTerrainNormalFromHeight,
  terrainNormalSampleStepM,
} from '../../world/mapProps/mapPropTerrainAlign';
import {
  samplePropTerrainSurfaceNormal,
  samplePropTerrainSurfaceY,
} from '../../world/terrain/cpu/terrainSurfaceCpu';

const _rayOrigin = new Vector3();
const _rayDir = new Vector3(0, -1, 0);
const _raycaster = new Raycaster();
const _bounds = new Box3();

function useCpuTerrainSurface(terrain: Pick<MapTerrainContext, 'detailDisplacementMap'>): boolean {
  return VISUAL.terrain.displacementEnabled && terrain.detailDisplacementMap !== null;
}

/**
 * World Y on the terrain surface at (x, z). Prefers CPU macro + detail displacement when
 * maps are available (matches play mode); raycasts the editor CPU-baked mesh otherwise.
 */
export function sampleEditorTerrainSurfaceY(
  terrain: Pick<MapTerrainContext, 'mesh' | 'getWorldY' | 'detailDisplacementMap'>,
  x: number,
  z: number,
): number {
  if (useCpuTerrainSurface(terrain)) {
    return samplePropTerrainSurfaceY(terrain as MapTerrainContext, x, z);
  }

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
  terrain: Pick<MapTerrainContext, 'mesh' | 'getWorldY' | 'detailDisplacementMap'>,
  x: number,
  z: number,
  surfaceLift = 0,
): number {
  return sampleEditorTerrainSurfaceY(terrain, x, z) + surfaceLift - VISUAL.props.surfaceSinkM;
}

/** World-space terrain normal at (x, z) — CPU surface, raycast face, or height-grid fallback. */
export function sampleEditorTerrainSurfaceNormal(
  terrain: Pick<MapTerrainContext, 'mesh' | 'getWorldY' | 'grids' | 'detailDisplacementMap'>,
  x: number,
  z: number,
  target = new Vector3(),
): Vector3 {
  if (useCpuTerrainSurface(terrain)) {
    return samplePropTerrainSurfaceNormal(terrain as MapTerrainContext, x, z, target);
  }

  _rayOrigin.set(x, 4096, z);
  _raycaster.set(_rayOrigin, _rayDir);
  const hits = _raycaster.intersectObject(terrain.mesh, true);
  if (hits.length > 0 && hits[0].normal) {
    return target.copy(hits[0].normal).normalize();
  }
  return sampleTerrainNormalFromHeight(
    terrain.getWorldY,
    x,
    z,
    terrainNormalSampleStepM(terrain.grids?.size),
    target,
  );
}
