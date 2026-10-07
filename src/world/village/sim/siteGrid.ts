// src/world/village/sim/siteGrid.ts — village-local terrain grid: height, slope, water and building occupancy
import type { TerrainSampler } from './terrainSampler.ts';
import type { Building } from './villageTypes.ts';

/**
 * Occupant ids on the grid: buildings use their own (positive) id, fields a negative one
 * (`fieldOccupant`), and these reserve ground that is not a building.
 */
export const OCCUPANT = {
  FREE: 0,
  /** Ground kept for the well until it is dug. */
  WELL: -1000,
  /** Keep-clear plaza in front of the temple: houses avoid it, the well may use it. */
  PLAZA: -2000,
} as const;

/** Occupant id of a field's footprint. */
export const fieldOccupant = (fieldId: number): number => -fieldId;

export interface SiteGrid {
  readonly cellM: number;
  /** Cells per side. */
  readonly size: number;
  /** World position of the grid's minimum corner. */
  readonly originX: number;
  readonly originZ: number;
  readonly height: Float32Array;
  /** Rise over run at the cell centre. */
  readonly slope: Float32Array;
  readonly water: Uint8Array;
  /** Id of the building whose footprint (plus spacing) covers the cell, 0 = free. */
  readonly occupant: Int32Array;
}

export function createSiteGrid(
  sampler: TerrainSampler,
  centerX: number,
  centerZ: number,
  radiusM: number,
  cellM: number,
): SiteGrid {
  const size = Math.ceil((2 * radiusM) / cellM);
  const originX = centerX - (size * cellM) / 2;
  const originZ = centerZ - (size * cellM) / 2;
  const count = size * size;
  const height = new Float32Array(count);
  const slope = new Float32Array(count);
  const water = new Uint8Array(count);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = originX + (i + 0.5) * cellM;
      const z = originZ + (j + 0.5) * cellM;
      const index = j * size + i;
      height[index] = sampler.getY(x, z);
      const ny = Math.max(1e-3, sampler.getNormalY(x, z));
      slope[index] = Math.sqrt(Math.max(0, 1 - ny * ny)) / ny;
      water[index] = sampler.isWet(x, z) ? 1 : 0;
    }
  }
  return { cellM, size, originX, originZ, height, slope, water, occupant: new Int32Array(count) };
}

/** Cell index containing (x, z), or -1 outside the grid. */
export function cellIndex(grid: SiteGrid, x: number, z: number): number {
  const i = Math.floor((x - grid.originX) / grid.cellM);
  const j = Math.floor((z - grid.originZ) / grid.cellM);
  if (i < 0 || j < 0 || i >= grid.size || j >= grid.size) return -1;
  return j * grid.size + i;
}

/**
 * Visit every cell whose centre falls inside the rotated footprint grown by `marginM`.
 * Stops early (returning false) when `visit` returns false.
 */
export function forEachFootprintCell(
  grid: SiteGrid,
  x: number,
  z: number,
  rotY: number,
  halfW: number,
  halfD: number,
  marginM: number,
  visit: (index: number) => boolean | undefined,
): boolean {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const ex = halfW + marginM;
  const ez = halfD + marginM;
  const reach = Math.hypot(ex, ez);
  const i0 = Math.max(0, Math.floor((x - reach - grid.originX) / grid.cellM));
  const i1 = Math.min(grid.size - 1, Math.floor((x + reach - grid.originX) / grid.cellM));
  const j0 = Math.max(0, Math.floor((z - reach - grid.originZ) / grid.cellM));
  const j1 = Math.min(grid.size - 1, Math.floor((z + reach - grid.originZ) / grid.cellM));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = grid.originX + (i + 0.5) * grid.cellM - x;
      const dz = grid.originZ + (j + 0.5) * grid.cellM - z;
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) > ex || Math.abs(lz) > ez) continue;
      if (visit(j * grid.size + i) === false) return false;
    }
  }
  return true;
}

/** True when the footprint is inside the grid, dry and clear of other buildings. */
export function footprintFree(
  grid: SiteGrid,
  x: number,
  z: number,
  rotY: number,
  halfW: number,
  halfD: number,
  marginM: number,
  /** Occupant id that counts as free (the plaza is open to the well, closed to houses). */
  ignoreId: number = OCCUPANT.FREE,
): boolean {
  const reach = Math.hypot(halfW + marginM, halfD + marginM);
  if (cellIndex(grid, x - reach, z - reach) < 0 || cellIndex(grid, x + reach, z + reach) < 0) {
    return false;
  }
  return forEachFootprintCell(
    grid,
    x,
    z,
    rotY,
    halfW,
    halfD,
    marginM,
    (index) =>
      (grid.occupant[index] === OCCUPANT.FREE || grid.occupant[index] === ignoreId) &&
      grid.water[index] === 0,
  );
}

/** Mark a rotated rectangle plus spacing as occupied by `id` (see `OCCUPANT`). */
export function stampFootprint(
  grid: SiteGrid,
  id: number,
  x: number,
  z: number,
  rotY: number,
  halfW: number,
  halfD: number,
  marginM: number,
): void {
  forEachFootprintCell(grid, x, z, rotY, halfW, halfD, marginM, (index) => {
    grid.occupant[index] = id;
    return true;
  });
}

/** Mark the building's footprint plus spacing as occupied. */
export function stampBuilding(grid: SiteGrid, building: Building, marginM: number): void {
  stampFootprint(
    grid,
    building.id,
    building.x,
    building.z,
    building.rotY,
    building.halfW,
    building.halfD,
    marginM,
  );
}
