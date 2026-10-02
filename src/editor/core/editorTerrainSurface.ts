// src/editor/core/editorTerrainSurface.ts — sample visible editor terrain height at world XZ
import { Vector3 } from 'three';
import { WORLD } from '../../config/world';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import { sampleTerrainNormalFromHeight } from '../../world/mapProps/mapPropTerrainAlign';
import { terrainMeshSegments } from '../../world/terrain/cpu/terrainChiselCpu';
import type { PropTerrainSurface } from '../../world/terrain/cpu/terrainSurfaceCpu';

function editorMeshSegments(terrain: Pick<MapTerrainContext, 'meshSegments'>): number {
  return Math.max(1, terrain.meshSegments ?? terrainMeshSegments());
}

/**
 * World Y on the editor PlaneGeometry surface (after rotateX(-π/2)).
 * Matches Three.js indices `a,b,d` / `b,c,d` so props sit on the visible mesh, not the
 * finer height-grid peaks that the 2 m editor tessellation chords under.
 */
function sampleMeshTriWorldY(
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
