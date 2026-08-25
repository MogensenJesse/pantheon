// src/editor/tools/PropBiomeFill.ts — replace props on a painted biome with a weighted mix
import { WORLD } from '../../config/world';
import { type MapGrids, sampleBiomeNearest, sampleHeightBilinear } from '../../map/MapGrids';
import { BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import { MAX_MAP_ENTITIES } from '../../map/validateMapPayload';
import type { EditorEntityStore } from '../core/EditorEntityStore';
import { createPropAt } from '../place/entityPlacement';

/** Hex cell area factor for min-distance packing (spacing² × √3/2). */
const HEX_PACKING_AREA = Math.sqrt(3) / 2;

export interface PropBiomeFillOptions {
  store: EditorEntityStore;
  grids: MapGrids;
  worldSize: number;
  biome: BiomeIdValue;
  mix: readonly string[];
  weights: Readonly<Record<string, number>>;
  /** Packing fill fraction 0.1–1 (sidebar 10–100%). */
  density01: number;
  /** Minimum distance between props (metres). */
  spacing: number;
}

export interface PropBiomeFillResult {
  removedUids: string[];
  addedUids: string[];
  /** True when the save-entity budget truncated the packing target. */
  saveCapped: boolean;
}

interface StrokePosition {
  x: number;
  z: number;
}

function distSqXZ(a: StrokePosition, b: StrokePosition): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function spacingCellKey(x: number, z: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
}

function gridToWorld(i: number, j: number, size: number, worldSize: number): StrokePosition {
  const max = Math.max(1, size - 1);
  return {
    x: (i / max - 0.5) * worldSize,
    z: (j / max - 0.5) * worldSize,
  };
}

function pickWeighted(
  mix: readonly string[],
  weights: Readonly<Record<string, number>>,
): string | null {
  let total = 0;
  for (const id of mix) {
    total += Math.max(0, weights[id] ?? 1);
  }
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const id of mix) {
    r -= Math.max(0, weights[id] ?? 1);
    if (r <= 0) return id;
  }
  return mix[mix.length - 1] ?? null;
}

function shuffleInPlace(values: number[]): void {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = values[i]!;
    values[i] = values[j]!;
    values[j] = tmp;
  }
}

function isDryLand(grids: MapGrids, x: number, z: number): boolean {
  if (sampleBiomeNearest(grids, x, z) === BiomeId.Water) return false;
  return sampleHeightBilinear(grids, x, z) >= WORLD.BIOMES.WATER.max;
}

function cellIsEligible(grids: MapGrids, idx: number, biome: BiomeIdValue): boolean {
  if (grids.biome[idx] !== biome) return false;
  if (biome === BiomeId.Water || grids.biome[idx] === BiomeId.Water) return false;
  return grids.height[idx]! >= WORLD.BIOMES.WATER.max;
}

export interface PropBiomeFillEstimate {
  eligibleCells: number;
  packingTarget: number;
  targetCount: number;
  remainingBudget: number;
  saveCapped: boolean;
}

export interface PropBiomeFillEstimateOptions {
  grids: MapGrids;
  worldSize: number;
  biome: BiomeIdValue;
  density01: number;
  spacing: number;
  entityCount: number;
}

/** Sidebar preview — same packing formula as apply, without placement jitter/spacing rejections. */
export function estimatePropBiomeFill(
  options: PropBiomeFillEstimateOptions,
): PropBiomeFillEstimate {
  const { grids, worldSize, biome, density01, spacing, entityCount } = options;
  let eligibleCells = 0;
  for (let idx = 0; idx < grids.biome.length; idx++) {
    if (cellIsEligible(grids, idx, biome)) eligibleCells += 1;
  }
  if (eligibleCells === 0) {
    return {
      eligibleCells: 0,
      packingTarget: 0,
      targetCount: 0,
      remainingBudget: Math.max(0, MAX_MAP_ENTITIES - entityCount),
      saveCapped: false,
    };
  }

  const cellSize = worldSize / Math.max(1, grids.size - 1);
  const packingDist = Math.max(spacing, 0.5);
  const density = Math.min(1, Math.max(0.1, density01));
  const packingArea = packingDist * packingDist * HEX_PACKING_AREA;
  const biomeAreaM2 = eligibleCells * cellSize * cellSize;
  const packingTarget = Math.max(1, Math.round((biomeAreaM2 / packingArea) * density));
  const remainingBudget = Math.max(0, MAX_MAP_ENTITIES - entityCount);
  const saveCapped = packingTarget > remainingBudget;
  const targetCount = Math.min(packingTarget, remainingBudget);

  return { eligibleCells, packingTarget, targetCount, remainingBudget, saveCapped };
}

/** Remove props on `biome`, then scatter a weighted mix with spacing. */
export function applyPropBiomeFill(options: PropBiomeFillOptions): PropBiomeFillResult {
  const { store, grids, worldSize, biome, mix, weights, density01, spacing } = options;
  const removedUids: string[] = [];
  const addedUids: string[] = [];

  if (mix.length === 0 || pickWeighted(mix, weights) === null) {
    return { removedUids, addedUids, saveCapped: false };
  }

  const toRemove: string[] = [];
  for (const { uid, entity } of store.getAll()) {
    if (entity.type !== 'prop') continue;
    if (sampleBiomeNearest(grids, entity.x, entity.z) !== biome) continue;
    toRemove.push(uid);
  }
  for (const uid of toRemove) {
    if (!store.remove(uid)) continue;
    removedUids.push(uid);
  }

  const { size } = grids;
  const cellSize = worldSize / Math.max(1, size - 1);
  const eligible: number[] = [];
  for (let idx = 0; idx < grids.biome.length; idx++) {
    if (cellIsEligible(grids, idx, biome)) eligible.push(idx);
  }
  if (eligible.length === 0) {
    return { removedUids, addedUids, saveCapped: false };
  }

  const estimate = estimatePropBiomeFill({
    grids,
    worldSize,
    biome,
    density01,
    spacing,
    entityCount: store.size,
  });
  const { targetCount, saveCapped } = estimate;
  if (targetCount <= 0) {
    return { removedUids, addedUids, saveCapped };
  }

  const packingDist = Math.max(spacing, 0.5);

  shuffleInPlace(eligible);

  const spacingGrid = new Map<string, StrokePosition[]>();
  const strokeCellSize = Math.max(packingDist, 0.001);
  const spacingSq = packingDist * packingDist;

  const remember = (pos: StrokePosition) => {
    const key = spacingCellKey(pos.x, pos.z, strokeCellSize);
    const bucket = spacingGrid.get(key);
    if (bucket) bucket.push(pos);
    else spacingGrid.set(key, [pos]);
  };

  for (const { entity } of store.getAll()) {
    if (entity.type !== 'prop') continue;
    remember({ x: entity.x, z: entity.z });
  }

  const isTooClose = (pos: StrokePosition): boolean => {
    const cx = Math.floor(pos.x / strokeCellSize);
    const cz = Math.floor(pos.z / strokeCellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = spacingGrid.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (const existing of bucket) {
          if (distSqXZ(pos, existing) < spacingSq) return true;
        }
      }
    }
    return false;
  };

  const jitter = cellSize * 0.45;

  for (let n = 0; n < eligible.length && addedUids.length < targetCount; n++) {
    const idx = eligible[n]!;
    const i = idx % size;
    const j = Math.floor(idx / size);
    const base = gridToWorld(i, j, size, worldSize);
    const pos: StrokePosition = {
      x: base.x + (Math.random() * 2 - 1) * jitter,
      z: base.z + (Math.random() * 2 - 1) * jitter,
    };
    if (sampleBiomeNearest(grids, pos.x, pos.z) !== biome) continue;
    if (!isDryLand(grids, pos.x, pos.z)) continue;
    if (isTooClose(pos)) continue;

    const placeId = pickWeighted(mix, weights);
    if (!placeId) continue;
    const entity = createPropAt(placeId, pos.x, pos.z);
    if (!entity) continue;

    const uid = store.add(entity);
    remember(pos);
    addedUids.push(uid);
  }

  return { removedUids, addedUids, saveCapped };
}
