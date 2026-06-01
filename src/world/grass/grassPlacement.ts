// src/world/grass/grassPlacement.ts — painted-biome foliage placement + per-cell bucketing

import { foliageVariantsForPackAndClass } from '../../assets/assetManifest';
import { PHASE0 } from '../../config/phase0';
import { devSettings } from '../../core/GameState';
import { BiomeId } from '../../map/MapTypes';
import { isNearPaintedPath, sampleBiomeNearest } from '../../map/MapGrids';
import { pickWeighted, tooCloseLandmarks } from '../scatter/placementEngine';
import type { Placement, PlacementRules } from '../scatter/placementTypes';
import type { TerrainContext } from '../TerrainGenerator';
import { WORLD } from '../WorldConfig';
import {
  FOLIAGE_SCATTER_BIOME_KEYS,
  foliageRuleKeyForBiomeId,
  getFoliageBiomeRule,
  getFoliageBiomeRules,
  normalizePackWeights,
} from './foliageBiomeRules';
import { createFoliagePlacementGrid, type FoliagePlacementGrid } from './foliagePlacementGrid';
import type {
  FoliagePackKey,
  FoliagePlacement,
  FoliageScatterBiomeKey,
  FoliageVariantEntry,
} from './foliageTypes';
import { GRASS_ACCENT_BAND, GRASS_COVER_BAND } from './grassDevDefaults';

export interface FoliageScatterConfig extends PlacementRules {
  foliageClass: 'cover' | 'accent';
}

export interface GrassCellBucket {
  centerX: number;
  centerZ: number;
  placements: Placement[];
}

export function bucketPlacementsByCell(
  placements: Placement[],
  cellSize: number,
): GrassCellBucket[] {
  const cells = new Map<string, Placement[]>();
  for (const p of placements) {
    const cx = Math.floor(p.x / cellSize);
    const cz = Math.floor(p.z / cellSize);
    const key = `${cx},${cz}`;
    let list = cells.get(key);
    if (!list) {
      list = [];
      cells.set(key, list);
    }
    list.push(p);
  }

  const buckets: GrassCellBucket[] = [];
  for (const [key, list] of cells) {
    const [cx, cz] = key.split(',').map(Number);
    list.forEach((p, i) => {
      p.instanceIndex = i;
    });
    buckets.push({
      centerX: (cx + 0.5) * cellSize,
      centerZ: (cz + 0.5) * cellSize,
      placements: list,
    });
  }
  return buckets;
}

function pickPackForBiome(
  biomeKey: FoliageScatterBiomeKey,
  rng: () => number,
): FoliagePackKey | null {
  const weights = normalizePackWeights(getFoliageBiomeRule(biomeKey).packs);
  if (weights.length === 0) return null;
  const total = weights.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return entry.pack;
  }
  return weights[weights.length - 1].pack;
}

function pickVariant(
  packKey: FoliagePackKey,
  foliageClass: 'cover' | 'accent',
  rng: () => number,
): FoliageVariantEntry | null {
  const variants = foliageVariantsForPackAndClass(packKey, foliageClass);
  if (variants.length === 0) return null;
  return pickWeighted(variants, rng);
}

function terrainHasBiomeSampling(
  terrain: TerrainContext,
): terrain is TerrainContext & { grids: import('../../map/MapGrids').MapGrids } {
  return 'grids' in terrain && terrain.grids != null;
}

/**
 * Reject-sample foliage placements per painted biome band, honoring spacing,
 * landmark clearance, and path exclusion.
 */
export function scatterFoliagePlacements(
  config: FoliageScatterConfig,
  terrain: TerrainContext,
  rng: () => number,
): FoliagePlacement[] {
  if (!terrainHasBiomeSampling(terrain)) {
    if (import.meta.env.DEV) {
      console.warn('[foliage] terrain has no biome grid — scatter skipped');
    }
    return [];
  }

  const rules = getFoliageBiomeRules();
  const globalPlacements: FoliagePlacement[] = [];
  const grid: FoliagePlacementGrid = createFoliagePlacementGrid(config.minSpacing, rules);
  const pathExclusion = config.pathExclusionRadius ?? WORLD.JOURNEY.PATH_EXCLUSION_RADIUS;
  const { grids } = terrain;

  const bandSummary: Array<{ id: string; placed: number; want: number }> = [];

  for (const biomeKey of FOLIAGE_SCATTER_BIOME_KEYS) {
    const rule = rules[biomeKey];
    const bandCount = Math.round(config.count * rule.countShare);
    if (bandCount <= 0) continue;

    let bandPlaced = 0;
    let attempts = 0;
    const attemptLimit = bandCount * 50;

    while (bandPlaced < bandCount && attempts < attemptLimit) {
      attempts++;
      const x = (rng() - 0.5) * WORLD.SIZE * 0.9;
      const z = (rng() - 0.5) * WORLD.SIZE * 0.9;

      if (isNearPaintedPath(grids, x, z, pathExclusion)) continue;

      const biomeId = sampleBiomeNearest(grids, x, z);
      if (biomeId === BiomeId.Water || biomeId === BiomeId.Path) continue;

      const paintedKey = foliageRuleKeyForBiomeId(biomeId);
      if (paintedKey !== biomeKey) continue;

      const h = terrain.getHeightAt(x, z);
      if (grid.tooClose(x, z, biomeKey, config.minSpacing, rules)) continue;
      if (tooCloseLandmarks(x, z, config.landmarkClearance)) continue;

      const packKey = pickPackForBiome(biomeKey, rng);
      if (!packKey) continue;

      const variant = pickVariant(packKey, config.foliageClass, rng);
      if (!variant) continue;

      const placement: FoliagePlacement = {
        x,
        z,
        h,
        yRotation: rng() * Math.PI * 2,
        scale: config.scaleMin + rng() * (config.scaleMax - config.scaleMin),
        instanceIndex: globalPlacements.length,
        biomeKey,
        packKey: variant.packKey,
        meshName: variant.meshName,
        variantKey: variant.key,
      };
      globalPlacements.push(placement);
      grid.add(placement);
      bandPlaced++;
    }

    bandSummary.push({ id: biomeKey, placed: bandPlaced, want: bandCount });
  }

  if (import.meta.env.DEV) {
    const fmt = bandSummary.map((b) => `${b.id}=${b.placed}/${b.want}`).join(' ');
    console.info(`[foliage] ${config.foliageClass} bands → ${fmt}`);
  }

  return globalPlacements;
}

/** @deprecated Use scatterFoliagePlacements. */
export const scatterGrassPlacements = scatterFoliagePlacements;

export function grassScatterConfigs(): FoliageScatterConfig[] {
  const g = devSettings.grass;
  const mul = g.scaleMul;
  const surfaceLift = PHASE0.GRASS.SURFACE_LIFT;
  return [
    {
      foliageClass: 'cover',
      count: Math.round(PHASE0.SCATTER.GRASS_COVER_COUNT * g.densityMul),
      heightMin: 0,
      heightMax: 999,
      minSpacing: GRASS_COVER_BAND.minSpacing,
      landmarkClearance: 4,
      scaleMin: GRASS_COVER_BAND.scaleMin * mul,
      scaleMax: GRASS_COVER_BAND.scaleMax * mul,
      surfaceLift,
    },
    {
      foliageClass: 'accent',
      count: Math.round(PHASE0.SCATTER.GRASS_ACCENT_COUNT * g.densityMul),
      heightMin: 0,
      heightMax: 999,
      minSpacing: GRASS_ACCENT_BAND.minSpacing,
      landmarkClearance: 5,
      scaleMin: GRASS_ACCENT_BAND.scaleMin * mul,
      scaleMax: GRASS_ACCENT_BAND.scaleMax * mul,
      surfaceLift,
    },
  ];
}
