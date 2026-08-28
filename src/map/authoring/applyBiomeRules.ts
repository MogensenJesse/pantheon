// src/map/authoring/applyBiomeRules.ts — height/slope weighted biome fill for the editor Auto paint mode
import { WORLD } from '../../config/world.ts';
import type { MapGrids } from '../MapGrids.ts';
import {
  BiomeId,
  type BiomeIdValue,
  type BiomePaintRules,
  type BiomeRule,
  LAND_BIOME_RULE_KEYS,
  type LandBiomeRuleKey,
} from '../MapTypes.ts';

export type { BiomePaintRules, BiomeRule, LandBiomeRuleKey };
export { LAND_BIOME_RULE_KEYS };

const LAND_BIOME_IDS: Record<LandBiomeRuleKey, BiomeIdValue> = {
  shore: BiomeId.Shore,
  forest: BiomeId.Forest,
  meadow: BiomeId.Meadow,
  hills: BiomeId.Hills,
  mountain: BiomeId.Mountain,
};

const SLOPE_MAX_OPEN = 2.999;
/** Default slope-scaled height-band wander (normalized height at vertical). */
export const DEFAULT_BIOME_HEIGHT_VARIATION = 0.1;
const HEIGHT_VARIATION_CAP = 0.5;

function hash2(ix: number, iy: number, seed: number): number {
  let h = seed ^ (ix * 374761393 + iy * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fadeHermite(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in ~0…1. `scale` is lattice size in cells. */
function valueNoise2(x: number, y: number, scale: number, seed: number): number {
  const s = Math.max(1, scale);
  const gx = x / s;
  const gy = y / s;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = fadeHermite(gx - x0);
  const ty = fadeHermite(gy - y0);
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * tx;
  const nx1 = n01 + (n11 - n01) * tx;
  return nx0 + (nx1 - nx0) * ty;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampHeightVariation(v: number): number {
  return Math.max(0, Math.min(HEIGHT_VARIATION_CAP, v));
}

function ruleMaskMatches(rule: BiomeRule, mask: number | undefined): boolean {
  if (mask === undefined) return true;
  const lo = rule.maskMin ?? 0;
  const hi = rule.maskMax ?? 1;
  return mask >= lo && mask <= hi;
}

function ruleSlopeMatches(rule: BiomeRule, slope: number): boolean {
  if (rule.weight <= 0 || rule.density <= 0) return false;
  if (slope < rule.slopeMin) return false;
  const slopeHi = rule.slopeMax >= SLOPE_MAX_OPEN ? Number.POSITIVE_INFINITY : rule.slopeMax;
  return slope <= slopeHi;
}

function isLandBiomeId(id: number): boolean {
  return (
    id === BiomeId.Shore ||
    id === BiomeId.Forest ||
    id === BiomeId.Meadow ||
    id === BiomeId.Hills ||
    id === BiomeId.Mountain
  );
}

/** Lattice for height-band wander / density — independent of min-blotch size. */
const HEIGHT_WOBBLE_NOISE_SCALE = 20;

/**
 * Recolor 4-connected land islands whose area is below `minArea` to the majority
 * neighboring land biome. Path and water cells are left untouched.
 */
function absorbSmallBiomeBlotches(biome: Uint8Array, size: number, minArea: number): void {
  if (minArea <= 1) return;
  const n = size * size;
  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  const component = new Int32Array(n);
  const votes = new Uint32Array(8);

  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    const id = biome[start]!;
    if (!isLandBiomeId(id)) {
      seen[start] = 1;
      continue;
    }

    let qh = 0;
    let qt = 0;
    q[qt++] = start;
    seen[start] = 1;
    let count = 0;

    const enqueue = (nidx: number) => {
      if (seen[nidx] || biome[nidx] !== id) return;
      seen[nidx] = 1;
      q[qt++] = nidx;
    };

    while (qh < qt) {
      const idx = q[qh++]!;
      component[count++] = idx;
      const x = idx % size;
      const y = (idx / size) | 0;
      if (x > 0) enqueue(idx - 1);
      if (x + 1 < size) enqueue(idx + 1);
      if (y > 0) enqueue(idx - size);
      if (y + 1 < size) enqueue(idx + size);
    }

    if (count >= minArea) continue;

    votes.fill(0);
    for (let c = 0; c < count; c++) {
      const idx = component[c]!;
      const x = idx % size;
      const y = (idx / size) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const nid = biome[ny * size + nx]!;
          if (nid === id || !isLandBiomeId(nid)) continue;
          votes[nid]++;
        }
      }
    }

    let bestId = id;
    let bestN = 0;
    for (let b = 0; b < votes.length; b++) {
      if (votes[b]! > bestN) {
        bestN = votes[b]!;
        bestId = b;
      }
    }
    if (bestN === 0) continue;
    for (let c = 0; c < count; c++) biome[component[c]!] = bestId;
  }
}

export function defaultBiomeRule(partial?: Partial<BiomeRule>): BiomeRule {
  return {
    weight: 1,
    density: 1,
    heightMin: 0,
    heightMax: 1,
    slopeMin: 0,
    slopeMax: 3,
    maskMin: 0,
    maskMax: 1,
    ...partial,
  };
}

export function defaultBiomePaintRules(): BiomePaintRules {
  return {
    seed: 1,
    noiseScale: 32,
    heightVariation: DEFAULT_BIOME_HEIGHT_VARIATION,
    preservePaths: true,
    autoWater: true,
    waterHeightMax: WORLD.BIOMES.WATER.max,
    shore: defaultBiomeRule({
      weight: 1,
      heightMin: 0,
      heightMax: 0.22,
      slopeMax: 0.7,
    }),
    forest: defaultBiomeRule({
      weight: 1,
      heightMin: 0.12,
      heightMax: 0.55,
      slopeMax: 0.75,
    }),
    meadow: defaultBiomeRule({
      weight: 1.3,
      density: 0.45,
      heightMin: 0.08,
      heightMax: 0.36,
      slopeMax: 0.35,
    }),
    hills: defaultBiomeRule({
      weight: 1.1,
      heightMin: 0.42,
      heightMax: 0.78,
      slopeMin: 0.15,
      slopeMax: 0.95,
    }),
    mountain: defaultBiomeRule({
      weight: 1.5,
      heightMin: 0.55,
      heightMax: 1,
      slopeMin: 0.45,
      slopeMax: 3,
    }),
  };
}

export function cloneBiomePaintRules(rules: BiomePaintRules): BiomePaintRules {
  return {
    seed: rules.seed,
    noiseScale: rules.noiseScale,
    heightVariation: rules.heightVariation,
    preservePaths: rules.preservePaths,
    autoWater: rules.autoWater,
    waterHeightMax: rules.waterHeightMax,
    shore: { ...rules.shore },
    forest: { ...rules.forest },
    meadow: { ...rules.meadow },
    hills: { ...rules.hills },
    mountain: { ...rules.mountain },
  };
}

export function packBiomePaintRules(waterHeightMax: number): BiomePaintRules {
  const rules = defaultBiomePaintRules();
  rules.waterHeightMax = waterHeightMax;
  rules.autoWater = true;
  rules.mountain.maskMin = 0.45;
  rules.hills.maskMin = 0.2;
  rules.meadow.maskMax = 0.35;
  rules.shore.maskMax = 0.45;
  return rules;
}

export function assignBiomePaintRules(target: BiomePaintRules, source: BiomePaintRules): void {
  target.seed = source.seed;
  target.noiseScale = source.noiseScale;
  target.heightVariation = source.heightVariation;
  target.preservePaths = source.preservePaths;
  target.autoWater = source.autoWater;
  target.waterHeightMax = source.waterHeightMax;
  for (const key of LAND_BIOME_RULE_KEYS) {
    Object.assign(target[key], source[key]);
  }
}

const RULE_NUMBER_KEYS: (keyof BiomeRule)[] = [
  'weight',
  'density',
  'heightMin',
  'heightMax',
  'slopeMin',
  'slopeMax',
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseBiomeRule(raw: unknown): BiomeRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  for (const key of RULE_NUMBER_KEYS) {
    if (!isFiniteNumber(o[key])) return null;
  }
  return {
    weight: o.weight as number,
    density: o.density as number,
    heightMin: o.heightMin as number,
    heightMax: o.heightMax as number,
    slopeMin: o.slopeMin as number,
    slopeMax: o.slopeMax as number,
    maskMin: isFiniteNumber(o.maskMin) ? o.maskMin : 0,
    maskMax: isFiniteNumber(o.maskMax) ? o.maskMax : 1,
  };
}

/** Returns a cloned rules object, or null when the payload is missing/invalid. */
export function parseBiomePaintRules(raw: unknown): BiomePaintRules | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(o.seed) ||
    !isFiniteNumber(o.noiseScale) ||
    !isFiniteNumber(o.waterHeightMax)
  ) {
    return null;
  }
  if (o.heightVariation !== undefined && !isFiniteNumber(o.heightVariation)) return null;
  if (typeof o.preservePaths !== 'boolean' || typeof o.autoWater !== 'boolean') return null;
  const shore = parseBiomeRule(o.shore);
  const forest = parseBiomeRule(o.forest);
  const meadow = parseBiomeRule(o.meadow);
  const hills = parseBiomeRule(o.hills);
  const mountain = parseBiomeRule(o.mountain);
  if (!shore || !forest || !meadow || !hills || !mountain) return null;
  return {
    seed: o.seed,
    noiseScale: o.noiseScale,
    heightVariation:
      o.heightVariation === undefined ? 0 : clampHeightVariation(o.heightVariation as number),
    preservePaths: o.preservePaths,
    autoWater: o.autoWater,
    waterHeightMax: o.waterHeightMax,
    shore,
    forest,
    meadow,
    hills,
    mountain,
  };
}

const LAND_KEY_BY_ID: Partial<Record<BiomeIdValue, LandBiomeRuleKey>> = {
  [BiomeId.Shore]: 'shore',
  [BiomeId.Forest]: 'forest',
  [BiomeId.Meadow]: 'meadow',
  [BiomeId.Hills]: 'hills',
  [BiomeId.Mountain]: 'mountain',
};

const HEIGHT_BINS = 100;
const SLOPE_BINS = 60;
const SLOPE_CAP = 3;

type BiomeHistogram = {
  count: number;
  heightBins: Uint32Array;
  slopeBins: Uint32Array;
};

function percentileFromBins(
  bins: Uint32Array,
  count: number,
  p: number,
  binToValue: (bin: number) => number,
): number {
  if (count <= 0) return 0;
  const target = Math.floor(Math.max(0, Math.min(1, p)) * (count - 1));
  let acc = 0;
  for (let i = 0; i < bins.length; i++) {
    acc += bins[i]!;
    if (acc > target) return binToValue(i);
  }
  return binToValue(bins.length - 1);
}

/**
 * Estimate Auto-paint sliders from the current painted biomes + height.
 * Absent land biomes get weight 0 so Apply does not invent them.
 */
export function inferBiomePaintRulesFromGrids(grids: MapGrids, worldSize: number): BiomePaintRules {
  const result = defaultBiomePaintRules();
  const { size, height, biome } = grids;
  const cellSize = worldSize / Math.max(1, size - 1);
  const hScale = WORLD.HEIGHT_SCALE;

  const land: Record<LandBiomeRuleKey, BiomeHistogram> = {
    shore: {
      count: 0,
      heightBins: new Uint32Array(HEIGHT_BINS),
      slopeBins: new Uint32Array(SLOPE_BINS),
    },
    forest: {
      count: 0,
      heightBins: new Uint32Array(HEIGHT_BINS),
      slopeBins: new Uint32Array(SLOPE_BINS),
    },
    meadow: {
      count: 0,
      heightBins: new Uint32Array(HEIGHT_BINS),
      slopeBins: new Uint32Array(SLOPE_BINS),
    },
    hills: {
      count: 0,
      heightBins: new Uint32Array(HEIGHT_BINS),
      slopeBins: new Uint32Array(SLOPE_BINS),
    },
    mountain: {
      count: 0,
      heightBins: new Uint32Array(HEIGHT_BINS),
      slopeBins: new Uint32Array(SLOPE_BINS),
    },
  };

  let pathCount = 0;
  let waterCount = 0;
  let waterMax = 0;

  for (let j = 0; j < size; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(size - 1, j + 1);
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      const id = biome[idx] as BiomeIdValue;
      if (id === BiomeId.Path) {
        pathCount++;
        continue;
      }
      const heightNorm = clamp01(height[idx]!);
      if (id === BiomeId.Water) {
        waterCount++;
        if (heightNorm > waterMax) waterMax = heightNorm;
        continue;
      }
      const key = LAND_KEY_BY_ID[id];
      if (!key) continue;

      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(size - 1, i + 1);
      const dhdx =
        ((height[j * size + i1]! - height[j * size + i0]!) * hScale) / ((i1 - i0) * cellSize);
      const dhdz =
        ((height[j1 * size + i]! - height[j0 * size + i]!) * hScale) / ((j1 - j0) * cellSize);
      const slope = Math.hypot(dhdx, dhdz);

      const acc = land[key];
      acc.count++;
      acc.heightBins[
        Math.max(0, Math.min(HEIGHT_BINS - 1, Math.floor(heightNorm * HEIGHT_BINS)))
      ]!++;
      acc.slopeBins[
        Math.max(0, Math.min(SLOPE_BINS - 1, Math.floor((slope / SLOPE_CAP) * SLOPE_BINS)))
      ]!++;
    }
  }

  result.preservePaths = pathCount > 0;
  result.autoWater = waterCount > 0;
  result.waterHeightMax = waterCount > 0 ? Math.min(0.2, waterMax) : result.waterHeightMax;

  let maxCount = 0;
  for (const key of LAND_BIOME_RULE_KEYS) {
    if (land[key].count > maxCount) maxCount = land[key].count;
  }

  for (const key of LAND_BIOME_RULE_KEYS) {
    const acc = land[key];
    if (acc.count === 0 || maxCount === 0) {
      result[key].weight = 0;
      continue;
    }
    const heightMin = percentileFromBins(
      acc.heightBins,
      acc.count,
      0.05,
      (bin) => (bin + 0.5) / HEIGHT_BINS,
    );
    const heightMax = percentileFromBins(
      acc.heightBins,
      acc.count,
      0.95,
      (bin) => (bin + 0.5) / HEIGHT_BINS,
    );
    const slopeMin = percentileFromBins(
      acc.slopeBins,
      acc.count,
      0.05,
      (bin) => ((bin + 0.5) / SLOPE_BINS) * SLOPE_CAP,
    );
    let slopeMax = percentileFromBins(
      acc.slopeBins,
      acc.count,
      0.95,
      (bin) => ((bin + 0.5) / SLOPE_BINS) * SLOPE_CAP,
    );
    if (slopeMax >= SLOPE_MAX_OPEN) slopeMax = 3;
    result[key].heightMin = Math.min(heightMin, heightMax);
    result[key].heightMax = Math.max(heightMin, heightMax);
    result[key].slopeMin = Math.min(slopeMin, slopeMax);
    result[key].slopeMax = Math.max(slopeMin, slopeMax);
    result[key].density = 1;
    result[key].weight = Math.max(0.1, Math.round((acc.count / maxCount) * 15) / 10);
  }

  return result;
}

/** Reclassify painted biomes from height + slope using Auto-mode rules. */
export function applyBiomeRules(grids: MapGrids, rules: BiomePaintRules, worldSize: number): void {
  const { size, height, biome } = grids;
  const cellSize = worldSize / Math.max(1, size - 1);
  const hScale = WORLD.HEIGHT_SCALE;
  const noiseScale = Math.max(1, rules.noiseScale);
  const heightVariation = clampHeightVariation(rules.heightVariation ?? 0);
  const seed = Math.max(1, Math.floor(rules.seed) || 1);
  const waterMax = rules.waterHeightMax;

  for (let j = 0; j < size; j++) {
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(size - 1, j + 1);
    for (let i = 0; i < size; i++) {
      const idx = j * size + i;
      if (rules.preservePaths && biome[idx] === BiomeId.Path) continue;

      const heightNorm = height[idx]!;
      if (rules.autoWater && heightNorm < waterMax) {
        biome[idx] = BiomeId.Water;
        continue;
      }
      if (!rules.autoWater && biome[idx] === BiomeId.Water) continue;

      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(size - 1, i + 1);
      const dhdx =
        ((height[j * size + i1]! - height[j * size + i0]!) * hScale) / ((i1 - i0) * cellSize);
      const dhdz =
        ((height[j1 * size + i]! - height[j0 * size + i]!) * hScale) / ((j1 - j0) * cellSize);
      const slope = Math.hypot(dhdx, dhdz);

      let bestId: BiomeIdValue = BiomeId.Forest;
      let bestScore = 0;
      const slopeT = Math.atan(slope) * (2 / Math.PI);
      for (let k = 0; k < LAND_BIOME_RULE_KEYS.length; k++) {
        const key = LAND_BIOME_RULE_KEYS[k]!;
        const rule = rules[key];
        if (!ruleSlopeMatches(rule, slope)) continue;
        const mask = Math.min(1, slope / 2.5);
        if (!ruleMaskMatches(rule, mask)) continue;
        const noise = valueNoise2(
          i + 0.5,
          j + 0.5,
          HEIGHT_WOBBLE_NOISE_SCALE,
          seed + (k + 1) * 101,
        );
        if (noise > clamp01(rule.density)) continue;
        const heightWobble = heightVariation * slopeT * (noise * 2 - 1);
        const heightTest = heightNorm + heightWobble;
        if (heightTest < rule.heightMin || heightTest > rule.heightMax) continue;
        if (rule.weight > bestScore) {
          bestScore = rule.weight;
          bestId = LAND_BIOME_IDS[key];
        }
      }
      biome[idx] = bestScore > 0 ? bestId : BiomeId.Forest;
    }
  }

  const minArea = Math.round(noiseScale * noiseScale);
  absorbSmallBiomeBlotches(biome, size, minArea);
  absorbSmallBiomeBlotches(biome, size, minArea);
}
