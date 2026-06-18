// src/map/gridDirtyRegion.ts — grid-cell bounds for incremental sculpt mesh/texture sync
import { worldToGridFrac } from './MapGrids';

export interface GridDirtyRegion {
  readonly iMin: number;
  readonly iMax: number;
  readonly jMin: number;
  readonly jMax: number;
}

/** Grid-cell AABB for a world-space brush disc (matches forEachCellInDisc bounds). */
export function discGridBounds(
  x: number,
  z: number,
  radius: number,
  worldSize: number,
  gridSize: number,
): GridDirtyRegion {
  const { u, v } = worldToGridFrac(x, z, worldSize, gridSize);
  const rCells = (radius / worldSize) * gridSize;
  const iCenter = Math.round(u);
  const jCenter = Math.round(v);

  return {
    iMin: Math.max(0, Math.floor(iCenter - rCells)),
    iMax: Math.min(gridSize - 1, Math.ceil(iCenter + rCells)),
    jMin: Math.max(0, Math.floor(jCenter - rCells)),
    jMax: Math.min(gridSize - 1, Math.ceil(jCenter + rCells)),
  };
}

export function mergeDirtyRegions(
  acc: GridDirtyRegion | null,
  next: GridDirtyRegion,
): GridDirtyRegion {
  if (!acc) return next;
  return {
    iMin: Math.min(acc.iMin, next.iMin),
    iMax: Math.max(acc.iMax, next.iMax),
    jMin: Math.min(acc.jMin, next.jMin),
    jMax: Math.max(acc.jMax, next.jMax),
  };
}

export function expandDirtyRegion(
  region: GridDirtyRegion,
  marginCells: number,
  gridSize: number,
): GridDirtyRegion {
  return {
    iMin: Math.max(0, region.iMin - marginCells),
    iMax: Math.min(gridSize - 1, region.iMax + marginCells),
    jMin: Math.max(0, region.jMin - marginCells),
    jMax: Math.min(gridSize - 1, region.jMax + marginCells),
  };
}

/** Conservative world XZ bounds for a grid region (optional cell margin). */
export function gridRegionToWorldBounds(
  region: GridDirtyRegion,
  gridSize: number,
  worldSize: number,
  marginCells = 0,
): { xMin: number; xMax: number; zMin: number; zMax: number } {
  const max = Math.max(1, gridSize - 1);
  const i0 = Math.max(0, region.iMin - marginCells);
  const i1 = Math.min(max, region.iMax + marginCells);
  const j0 = Math.max(0, region.jMin - marginCells);
  const j1 = Math.min(max, region.jMax + marginCells);
  return {
    xMin: (i0 / max - 0.5) * worldSize,
    xMax: (i1 / max - 0.5) * worldSize,
    zMin: (j0 / max - 0.5) * worldSize,
    zMax: (j1 / max - 0.5) * worldSize,
  };
}

export function isWorldPointInDirtyRegion(
  x: number,
  z: number,
  region: GridDirtyRegion,
  gridSize: number,
  worldSize: number,
  marginCells = 0,
): boolean {
  const { xMin, xMax, zMin, zMax } = gridRegionToWorldBounds(
    region,
    gridSize,
    worldSize,
    marginCells,
  );
  return x >= xMin && x <= xMax && z >= zMin && z <= zMax;
}
