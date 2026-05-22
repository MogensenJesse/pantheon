// src/world/grass/grassBiomeDensity.ts — per-biome grass counts and spacing (terrain height bands)
import { PHASE0 } from '../../config/phase0';
import { WORLD } from '../WorldConfig';

const { WATER, SHORE, FOREST, HILLS } = WORLD.BIOMES;

const SCATTER = PHASE0.GRASS.BIOME_SCATTER;

interface GrassBiomeBand {
  id: 'shore' | 'forest' | 'hills' | 'mountain';
  hMin: number;
  hMax: number;
  countShare: number;
  spacingMul: number;
}

/** Height bands aligned with terrain splat biomes. */
export const GRASS_BIOME_BANDS: readonly GrassBiomeBand[] = [
  { id: 'shore', hMin: WATER.max, hMax: SHORE.max, countShare: SCATTER.shore.countShare, spacingMul: SCATTER.shore.spacingMul },
  { id: 'forest', hMin: SHORE.max, hMax: FOREST.max, countShare: SCATTER.forest.countShare, spacingMul: SCATTER.forest.spacingMul },
  { id: 'hills', hMin: FOREST.max, hMax: HILLS.max, countShare: SCATTER.hills.countShare, spacingMul: SCATTER.hills.spacingMul },
  { id: 'mountain', hMin: HILLS.max, hMax: Infinity, countShare: SCATTER.mountain.countShare, spacingMul: SCATTER.mountain.spacingMul },
];

const MAX_SPACING_MUL = Math.max(...GRASS_BIOME_BANDS.map((b) => b.spacingMul));

function biomeAtHeight(h: number): GrassBiomeBand | null {
  if (h <= WATER.max) return null;
  for (const band of GRASS_BIOME_BANDS) {
    if (h >= band.hMin && h < band.hMax) return band;
  }
  if (h >= HILLS.max) return GRASS_BIOME_BANDS[3];
  return null;
}

function spacingForHeight(baseSpacing: number, h: number): number {
  const band = biomeAtHeight(h);
  if (!band) return baseSpacing * 4;
  return baseSpacing * band.spacingMul;
}

export interface GrassPlacement {
  x: number;
  z: number;
  h: number;
  yRotation: number;
  scale: number;
  instanceIndex: number;
}

/** Spatial hash for O(1) neighbour checks during scatter (avoids O(N²) height resampling). */
class PlacementGrid {
  private readonly cells = new Map<string, GrassPlacement[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  add(p: GrassPlacement): void {
    const cx = Math.floor(p.x / this.cellSize);
    const cz = Math.floor(p.z / this.cellSize);
    const k = this.key(cx, cz);
    let list = this.cells.get(k);
    if (!list) {
      list = [];
      this.cells.set(k, list);
    }
    list.push(p);
  }

  tooClose(x: number, z: number, h: number, baseSpacing: number): boolean {
    const need = spacingForHeight(baseSpacing, h);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.cells.get(this.key(cx + dx, cz + dz));
        if (!list) continue;
        for (const p of list) {
          const distX = p.x - x;
          const distZ = p.z - z;
          const distSq = distX * distX + distZ * distZ;
          const otherNeed = spacingForHeight(baseSpacing, p.h);
          const minDist = Math.max(need, otherNeed);
          if (distSq < minDist * minDist) return true;
        }
      }
    }
    return false;
  }
}

export function createPlacementGrid(baseMinSpacing: number): PlacementGrid {
  return new PlacementGrid(baseMinSpacing * MAX_SPACING_MUL);
}
