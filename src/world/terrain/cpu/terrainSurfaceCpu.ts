// src/world/terrain/cpu/terrainSurfaceCpu.ts — CPU terrain surface for props (chiseled Y + N)
import { Vector3 } from 'three';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { sampleChiseledWorldNormal } from './terrainChiselCpu';

export interface PropTerrainSurface {
  sampleSurfaceY: (x: number, z: number) => number;
  sampleSurfaceNormal: (x: number, z: number, target?: Vector3) => Vector3;
}

export function createPropTerrainSurface(ctx: MapTerrainContext): PropTerrainSurface {
  return {
    sampleSurfaceY: (x, z) => ctx.getWorldY(x, z),
    sampleSurfaceNormal: (x, z, target = new Vector3()) =>
      sampleChiseledWorldNormal(ctx.grids, x, z, target),
  };
}

export function samplePropTerrainSurfaceY(ctx: MapTerrainContext, x: number, z: number): number {
  return ctx.getWorldY(x, z);
}

export function samplePropTerrainSurfaceNormal(
  ctx: MapTerrainContext,
  x: number,
  z: number,
  target = new Vector3(),
): Vector3 {
  return sampleChiseledWorldNormal(ctx.grids, x, z, target);
}
