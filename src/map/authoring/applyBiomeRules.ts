// src/map/authoring/applyBiomeRules.ts — height/slope weighted biome fill for the editor Auto paint mode
import { WORLD } from '../../config/world.ts';
import type { MapGrids } from '../MapGrids.ts';
import { BiomeId, type BiomeIdValue } from '../MapTypes.ts';

export interface BiomeRule {
  /** Relative claim when height/slope/density all match. 0 = never pick. */
  weight: number;
  /** 0–1 fraction of matching cells that may win this biome. */
  density: number;
  heightMin: number;
  heightMax: number;
  slopeMin: number;
  slopeMax: number;
}

export const LAND_BIOME_RULE_KEYS = ['shore', 'forest', 'meadow', 'hills', 'mountain'] as const;

export type LandBiomeRuleKey = (typeof LAND_BIOME_RULE_KEYS)[number];

export interface BiomePaintRules {
  seed: number;
  /** Density-patch size in cells. 1 = salt-and-pepper. */
  noiseScale: number;
  preservePaths: boolean;
  autoWater: boolean;
  waterHeightMax: number;
  shore: BiomeRule;
  forest: BiomeRule;
  meadow: BiomeRule;
  hills: BiomeRule;
  mountain: BiomeRule;
}

const LAND_BIOME_IDS: Record<LandBiomeRuleKey, BiomeIdValue> = {
  shore: BiomeId.Shore,
  forest: BiomeId.Forest,
  meadow: BiomeId.Meadow,
  hills: BiomeId.Hills,
  mountain: BiomeId.Mountain,
};

const SLOPE_MAX_OPEN = 2.999;

function hash2(ix: number, iy: number, seed: number): number {
  let h = seed ^ (ix * 374761393 + iy * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function densityNoise(i: number, j: number, scale: number, seed: number): number {
  const s = Math.max(1, scale);
  if (s <= 1.001) return hash2(i, j, seed);
  return hash2(Math.floor(i / s), Math.floor(j / s), seed);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function ruleMatches(rule: BiomeRule, heightNorm: number, slope: number): boolean {
  if (rule.weight <= 0 || rule.density <= 0) return false;
  if (heightNorm < rule.heightMin || heightNorm > rule.heightMax) return false;
  if (slope < rule.slopeMin) return false;
  const slopeHi = rule.slopeMax >= SLOPE_MAX_OPEN ? Number.POSITIVE_INFINITY : rule.slopeMax;
  return slope <= slopeHi;
}

export function defaultBiomeRule(partial?: Partial<BiomeRule>): BiomeRule {
  return {
    weight: 1,
    density: 1,
    heightMin: 0,
    heightMax: 1,
    slopeMin: 0,
    slopeMax: 3,
    ...partial,
  };
}

export function defaultBiomePaintRules(): BiomePaintRules {
  return {
    seed: 1,
    noiseScale: 32,
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

/** Reclassify painted biomes from height + slope using Auto-mode rules. */
export function applyBiomeRules(grids: MapGrids, rules: BiomePaintRules, worldSize: number): void {
  const { size, height, biome } = grids;
  const cellSize = worldSize / Math.max(1, size - 1);
  const hScale = WORLD.HEIGHT_SCALE;
  const noiseScale = Math.max(1, rules.noiseScale);
  const seed = Math.max(1, Math.floor(rules.seed) || 1);
  const waterMax = clamp01(rules.waterHeightMax);

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
      for (let k = 0; k < LAND_BIOME_RULE_KEYS.length; k++) {
        const key = LAND_BIOME_RULE_KEYS[k]!;
        const rule = rules[key];
        if (!ruleMatches(rule, heightNorm, slope)) continue;
        const noise = densityNoise(i, j, noiseScale, seed + (k + 1) * 101);
        if (noise > clamp01(rule.density)) continue;
        if (rule.weight > bestScore) {
          bestScore = rule.weight;
          bestId = LAND_BIOME_IDS[key];
        }
      }
      biome[idx] = bestScore > 0 ? bestId : BiomeId.Forest;
    }
  }
}
