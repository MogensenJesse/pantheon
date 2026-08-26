// src/editor/tools/PropBiomeFill.ts — scatter props on a painted biome (optional replace)
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
  /**
   * 0 = uniform density. 1 = large connected patches (especially interiors)
   * keep more props; small islands stay sparse.
   */
  sizeBias01: number;
  /** When true, delete props already on this biome before placing. */
  replaceExisting: boolean;
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

const DIST_INF = 65535;

/** Manhattan distance to the nearest ineligible cell (or map border). */
function fillEdgeDistance(mask: Uint8Array, size: number, dist: Uint16Array): void {
  const n = size * size;
  for (let idx = 0; idx < n; idx++) {
    if (!mask[idx]) {
      dist[idx] = 0;
      continue;
    }
    const i = idx % size;
    const j = (idx / size) | 0;
    dist[idx] = i === 0 || j === 0 || i === size - 1 || j === size - 1 ? 1 : DIST_INF;
  }
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      let d = dist[idx]!;
      if (d === 0) continue;
      if (i > 0) d = Math.min(d, dist[idx - 1]! + 1);
      if (j > 0) d = Math.min(d, dist[idx - size]! + 1);
      dist[idx] = d;
    }
  }
  for (let j = size - 1; j >= 0; j--) {
    for (let i = size - 1; i >= 0; i--) {
      const idx = j * size + i;
      let d = dist[idx]!;
      if (d === 0) continue;
      if (i + 1 < size) d = Math.min(d, dist[idx + 1]! + 1);
      if (j + 1 < size) d = Math.min(d, dist[idx + size]! + 1);
      dist[idx] = d;
    }
  }
}

interface PatchWeightField {
  eligible: number[];
  /** Per-cell keep chance 0–1. Ineligible cells stay 0. */
  weights: Float32Array;
  weightSum: number;
}

/**
 * Per-cell fill weight from connected-patch area (log) and distance-to-edge.
 * `sizeBias01` 0 = uniform; 1 = large interiors dense, small islands sparse.
 */
function buildPatchWeightField(
  grids: MapGrids,
  biome: BiomeIdValue,
  sizeBias01: number,
): PatchWeightField {
  const { size } = grids;
  const n = grids.biome.length;
  const eligible: number[] = [];
  for (let idx = 0; idx < n; idx++) {
    if (cellIsEligible(grids, idx, biome)) eligible.push(idx);
  }

  const weights = new Float32Array(n);
  const bias = Math.min(1, Math.max(0, sizeBias01));
  if (eligible.length === 0) {
    return { eligible, weights, weightSum: 0 };
  }
  if (bias <= 1e-4) {
    for (const idx of eligible) weights[idx] = 1;
    return { eligible, weights, weightSum: eligible.length };
  }

  const mask = new Uint8Array(n);
  for (const idx of eligible) mask[idx] = 1;

  const dist = new Uint16Array(n);
  fillEdgeDistance(mask, size, dist);

  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  const compArea: number[] = [];
  const compMaxDist: number[] = [];
  const compOf = new Int32Array(n);

  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    let qh = 0;
    let qt = 0;
    q[qt++] = start;
    seen[start] = 1;
    let area = 0;
    let maxD = 1;
    const cid = compArea.length;
    const enqueue = (nidx: number) => {
      if (!mask[nidx] || seen[nidx]) return;
      seen[nidx] = 1;
      q[qt++] = nidx;
    };
    while (qh < qt) {
      const idx = q[qh++]!;
      compOf[idx] = cid;
      area += 1;
      const d = dist[idx]!;
      if (d < DIST_INF && d > maxD) maxD = d;
      const x = idx % size;
      const y = (idx / size) | 0;
      if (x > 0) enqueue(idx - 1);
      if (x + 1 < size) enqueue(idx + 1);
      if (y > 0) enqueue(idx - size);
      if (y + 1 < size) enqueue(idx + size);
    }
    compArea.push(area);
    compMaxDist.push(maxD);
  }

  let minA = Infinity;
  let maxA = 0;
  for (const area of compArea) {
    if (area < minA) minA = area;
    if (area > maxA) maxA = area;
  }
  const logMin = Math.log(Math.max(1, minA));
  const logMax = Math.log(Math.max(1, maxA));
  const logSpan = Math.max(1e-6, logMax - logMin);

  let weightSum = 0;
  for (const idx of eligible) {
    const cid = compOf[idx]!;
    const area = compArea[cid]!;
    const sizeT = maxA <= minA ? 1 : (Math.log(area) - logMin) / logSpan;
    const interiorT = Math.min(1, dist[idx]! / Math.max(1, compMaxDist[cid]!));
    const core = sizeT * (0.3 + 0.7 * interiorT);
    const w = 1 - bias + bias * core;
    weights[idx] = w;
    weightSum += w;
  }

  return { eligible, weights, weightSum };
}

export interface PropBiomeFillEstimate {
  eligibleCells: number;
  packingTarget: number;
  targetCount: number;
  remainingBudget: number;
  saveCapped: boolean;
}

function packingCounts(
  weightSum: number,
  worldSize: number,
  gridSize: number,
  density01: number,
  spacing: number,
  entityCount: number,
): Pick<PropBiomeFillEstimate, 'packingTarget' | 'targetCount' | 'remainingBudget' | 'saveCapped'> {
  const cellSize = worldSize / Math.max(1, gridSize - 1);
  const packingDist = Math.max(spacing, 0.5);
  const density = Math.min(1, Math.max(0.1, density01));
  const packingArea = packingDist * packingDist * HEX_PACKING_AREA;
  const biomeAreaM2 = weightSum * cellSize * cellSize;
  const packingTarget = Math.max(1, Math.round((biomeAreaM2 / packingArea) * density));
  const remainingBudget = Math.max(0, MAX_MAP_ENTITIES - entityCount);
  const saveCapped = packingTarget > remainingBudget;
  const targetCount = Math.min(packingTarget, remainingBudget);
  return { packingTarget, targetCount, remainingBudget, saveCapped };
}

/** Props whose nearest painted biome matches `biome`. */
export function countPropsOnBiome(
  store: EditorEntityStore,
  grids: MapGrids,
  biome: BiomeIdValue,
): number {
  let n = 0;
  for (const { entity } of store.getAll()) {
    if (entity.type !== 'prop') continue;
    if (sampleBiomeNearest(grids, entity.x, entity.z) === biome) n++;
  }
  return n;
}

function fillBudgetEntityCount(
  entityCount: number,
  replaceExisting: boolean,
  propsOnBiome: number,
): number {
  if (!replaceExisting) return entityCount;
  return Math.max(0, entityCount - propsOnBiome);
}

export interface PropBiomeFillEstimateOptions {
  grids: MapGrids;
  worldSize: number;
  biome: BiomeIdValue;
  density01: number;
  spacing: number;
  entityCount: number;
  sizeBias01?: number;
  replaceExisting?: boolean;
  /** Props currently on the fill biome (for replace-mode budget). */
  propsOnBiome?: number;
}

/** Sidebar preview — same packing formula as apply, without placement jitter/spacing rejections. */
export function estimatePropBiomeFill(
  options: PropBiomeFillEstimateOptions,
): PropBiomeFillEstimate {
  const {
    grids,
    worldSize,
    biome,
    density01,
    spacing,
    entityCount,
    sizeBias01 = 0,
    replaceExisting = true,
    propsOnBiome = 0,
  } = options;
  const liveCount = fillBudgetEntityCount(entityCount, replaceExisting, propsOnBiome);
  const field = buildPatchWeightField(grids, biome, sizeBias01);
  const eligibleCells = field.eligible.length;
  if (eligibleCells === 0) {
    return {
      eligibleCells: 0,
      packingTarget: 0,
      targetCount: 0,
      remainingBudget: Math.max(0, MAX_MAP_ENTITIES - liveCount),
      saveCapped: false,
    };
  }

  return {
    eligibleCells,
    ...packingCounts(field.weightSum, worldSize, grids.size, density01, spacing, liveCount),
  };
}

/** Scatter a weighted mix onto `biome`. Optionally clear existing biome props first. */
export function applyPropBiomeFill(options: PropBiomeFillOptions): PropBiomeFillResult {
  const {
    store,
    grids,
    worldSize,
    biome,
    mix,
    weights,
    density01,
    spacing,
    sizeBias01 = 0,
    replaceExisting,
  } = options;
  const removedUids: string[] = [];
  const addedUids: string[] = [];

  if (mix.length === 0 || pickWeighted(mix, weights) === null) {
    return { removedUids, addedUids, saveCapped: false };
  }

  if (replaceExisting) {
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
  }

  const { size } = grids;
  const cellSize = worldSize / Math.max(1, size - 1);
  const field = buildPatchWeightField(grids, biome, sizeBias01);
  const eligible = field.eligible;
  if (eligible.length === 0) {
    return { removedUids, addedUids, saveCapped: false };
  }

  const { targetCount, saveCapped } = packingCounts(
    field.weightSum,
    worldSize,
    size,
    density01,
    spacing,
    store.size,
  );
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
    if (Math.random() > field.weights[idx]!) continue;
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
