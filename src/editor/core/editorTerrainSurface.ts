// src/editor/core/editorTerrainSurface.ts — sample visible editor terrain height at world XZ
import { Box3, type Object3D, Vector3 } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../../config/world';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import { sampleTerrainNormalFromHeight } from '../../world/mapProps/mapPropTerrainAlign';
import type { PropTerrainSurface } from '../../world/terrain/cpu/terrainSurfaceCpu';

const _bounds = new Box3();

function editorMeshSegments(terrain: Pick<MapTerrainContext, 'meshSegments'>): number {
  return Math.max(1, terrain.meshSegments ?? VISUAL.terrain.editorMeshSegments);
}

/**
 * World Y on the editor PlaneGeometry surface (after rotateX(-π/2)).
 * Matches Three.js indices `a,b,d` / `b,c,d` so props sit on the visible mesh, not the
 * finer height-grid peaks that the 2 m editor tessellation chords under.
 */
export function sampleMeshTriWorldY(
  getWorldY: (x: number, z: number) => number,
  x: number,
  z: number,
  worldSize: number,
  meshSegments: number,
): number {
  const seg = Math.max(1, meshSegments);
  const gx = (x / worldSize + 0.5) * seg;
  const gz = (z / worldSize + 0.5) * seg;
  const ix0 = Math.min(seg - 1, Math.max(0, Math.floor(gx)));
  const iz0 = Math.min(seg - 1, Math.max(0, Math.floor(gz)));
  const ix1 = ix0 + 1;
  const iz1 = iz0 + 1;
  const tx = Math.min(1, Math.max(0, gx - ix0));
  const tz = Math.min(1, Math.max(0, gz - iz0));
  const x0 = (ix0 / seg - 0.5) * worldSize;
  const z0 = (iz0 / seg - 0.5) * worldSize;
  const x1 = (ix1 / seg - 0.5) * worldSize;
  const z1 = (iz1 / seg - 0.5) * worldSize;
  const y00 = getWorldY(x0, z0);
  const y10 = getWorldY(x1, z0);
  const y01 = getWorldY(x0, z1);
  const y11 = getWorldY(x1, z1);
  if (tx + tz < 1) {
    return y00 * (1 - tx - tz) + y01 * tz + y10 * tx;
  }
  return y01 * (1 - tx) + y11 * (tx + tz - 1) + y10 * (1 - tz);
}

function sampleVisibleEditorY(
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'meshSegments'>,
  x: number,
  z: number,
): number {
  return sampleMeshTriWorldY(terrain.getWorldY, x, z, WORLD.SIZE, editorMeshSegments(terrain));
}

/** Editor prop placement surface — same tessellation as the visible GPU-displaced mesh. */
export function createEditorPropTerrainSurface(
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'meshSegments'>,
): PropTerrainSurface {
  const getY = (x: number, z: number) => sampleVisibleEditorY(terrain, x, z);
  const step = WORLD.SIZE / editorMeshSegments(terrain);
  return {
    sampleSurfaceY: getY,
    sampleSurfaceNormal: (x, z, target = new Vector3()) =>
      sampleTerrainNormalFromHeight(getY, x, z, step, target),
  };
}

/**
 * World Y on the terrain surface at (x, z) — editor mesh triangulation, not the
 * finer height-grid bilinear sample.
 */
export function sampleEditorTerrainSurfaceY(
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'meshSegments'>,
  x: number,
  z: number,
): number {
  return sampleVisibleEditorY(terrain, x, z);
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
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'meshSegments'>,
  x: number,
  z: number,
  surfaceLift = 0,
): number {
  return sampleEditorTerrainSurfaceY(terrain, x, z) + surfaceLift - VISUAL.props.surfaceSinkM;
}

/** World-space terrain normal at (x, z) from the visible editor mesh. */
export function sampleEditorTerrainSurfaceNormal(
  terrain: Pick<MapTerrainContext, 'getWorldY' | 'meshSegments'>,
  x: number,
  z: number,
  target = new Vector3(),
): Vector3 {
  const getY = (px: number, pz: number) => sampleVisibleEditorY(terrain, px, pz);
  return sampleTerrainNormalFromHeight(
    getY,
    x,
    z,
    WORLD.SIZE / editorMeshSegments(terrain),
    target,
  );
}
