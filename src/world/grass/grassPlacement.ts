// src/world/grass/grassPlacement.ts — biome-band rejection sampling + per-cell bucketing

import {
  GRASS_ACCENT_VARIANTS,
  GRASS_COVER_VARIANTS,
  type GrassVariantEntry,
} from '../../assets/assetManifest';
import { PHASE0 } from '../../config/phase0';
import { devSettings } from '../../core/GameState';
import { tooCloseToPathExclusion } from '../scatter/pathExclusion';
import { tooCloseLandmarks } from '../scatter/placementEngine';
import type { Placement, PlacementRules } from '../scatter/placementTypes';
import type { TerrainContext } from '../TerrainGenerator';
import { WORLD } from '../WorldConfig';
import { createPlacementGrid, GRASS_BIOME_BANDS, type GrassPlacement } from './grassBiomeDensity';
import { GRASS_ACCENT_BAND, GRASS_COVER_BAND } from './grassDevDefaults';

export interface GrassScatterConfig extends PlacementRules {
  entries: readonly GrassVariantEntry[];
}

export interface GrassCellBucket {
  centerX: number;
  centerZ: number;
  placements: Placement[];
}

/**
 * Split a flat list of placements into cell buckets keyed by `cellSize`-aligned
 * world coordinates and reindex each bucket's placements from 0. Each bucket
 * becomes one InstancedMesh during build so distance culling can flip
 * `mesh.visible` per cell.
 */
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

/**
 * Reject-sample grass placements one biome band at a time, honoring minSpacing,
 * landmark clearance, and path exclusion. Each band shares the same
 * `PlacementGrid` so spacing checks are global across bands.
 */
export function scatterGrassPlacements(
  config: PlacementRules,
  terrain: TerrainContext,
  rng: () => number,
): Placement[] {
  const globalPlacements: GrassPlacement[] = [];
  const grid = createPlacementGrid(config.minSpacing);
  const pathExclusion = config.pathExclusionRadius ?? WORLD.JOURNEY.PATH_EXCLUSION_RADIUS;

  const bandSummary: Array<{ id: string; placed: number; want: number }> = [];

  for (const band of GRASS_BIOME_BANDS) {
    const bandCount = Math.round(config.count * band.countShare);
    if (bandCount <= 0) continue;

    const hMin = Math.max(config.heightMin, band.hMin);
    const hMax = Math.min(config.heightMax, band.hMax);
    if (hMin >= hMax) continue;

    let bandPlaced = 0;
    let attempts = 0;
    const attemptLimit = bandCount * 50;

    while (bandPlaced < bandCount && attempts < attemptLimit) {
      attempts++;
      const x = (rng() - 0.5) * WORLD.SIZE * 0.9;
      const z = (rng() - 0.5) * WORLD.SIZE * 0.9;
      const h = terrain.getHeightAt(x, z);

      if (h < hMin || h > hMax) continue;
      if (grid.tooClose(x, z, h, config.minSpacing)) continue;
      if (tooCloseLandmarks(x, z, config.landmarkClearance)) continue;
      if (tooCloseToPathExclusion(terrain, x, z, pathExclusion)) continue;

      const placement: GrassPlacement = {
        x,
        z,
        h,
        yRotation: rng() * Math.PI * 2,
        scale: config.scaleMin + rng() * (config.scaleMax - config.scaleMin),
        instanceIndex: globalPlacements.length,
      };
      globalPlacements.push(placement);
      grid.add(placement);
      bandPlaced++;
    }

    bandSummary.push({ id: band.id, placed: bandPlaced, want: bandCount });
  }

  if (import.meta.env.DEV) {
    const fmt = bandSummary.map((b) => `${b.id}=${b.placed}/${b.want}`).join(' ');
    console.info(`[grass] bands → ${fmt}`);
  }

  return globalPlacements;
}

/** Live scatter configs blending PHASE0 budgets with dev panel multipliers. */
export function grassScatterConfigs(): GrassScatterConfig[] {
  const g = devSettings.grass;
  const mul = g.scaleMul;
  const surfaceLift = PHASE0.GRASS.SURFACE_LIFT;
  return [
    {
      entries: GRASS_COVER_VARIANTS,
      count: Math.round(PHASE0.SCATTER.GRASS_COVER_COUNT * g.densityMul),
      heightMin: GRASS_COVER_BAND.heightMin,
      heightMax: GRASS_COVER_BAND.heightMax,
      minSpacing: GRASS_COVER_BAND.minSpacing,
      landmarkClearance: 4,
      scaleMin: GRASS_COVER_BAND.scaleMin * mul,
      scaleMax: GRASS_COVER_BAND.scaleMax * mul,
      surfaceLift,
    },
    {
      entries: GRASS_ACCENT_VARIANTS,
      count: Math.round(PHASE0.SCATTER.GRASS_ACCENT_COUNT * g.densityMul),
      heightMin: GRASS_ACCENT_BAND.heightMin,
      heightMax: GRASS_ACCENT_BAND.heightMax,
      minSpacing: GRASS_ACCENT_BAND.minSpacing,
      landmarkClearance: 5,
      scaleMin: GRASS_ACCENT_BAND.scaleMin * mul,
      scaleMax: GRASS_ACCENT_BAND.scaleMax * mul,
      surfaceLift,
    },
  ];
}
