// src/world/scatter/propScatterConfigs.ts — tree/rock/plant scatter rules
import { ASSET_MANIFEST, LIVING_TREE_ENTRIES } from '../../assets/assetManifest';
import { PHASE0 } from '../../config/phase0';
import { WORLD } from '../WorldConfig';
import type { ScatterConfig } from './placementTypes';

export function buildPropScatterConfigs(): ScatterConfig[] {
  const [forestCx, forestCz] = WORLD.FOREST_CLUSTER.center;
  const forestR = WORLD.FOREST_CLUSTER.radius;

  return [
    {
      entries: LIVING_TREE_ENTRIES,
      count: PHASE0.SCATTER.TREE_PATH_COUNT,
      heightMin: 0.42,
      heightMax: 1.1,
      minSpacing: 3,
      landmarkClearance: 6,
      scaleMin: 0.85,
      scaleMax: 1.25,
      pathCorridor: true,
    },
    {
      entries: LIVING_TREE_ENTRIES,
      count: PHASE0.SCATTER.TREE_OPEN_COUNT,
      heightMin: 0.42,
      heightMax: 1.1,
      minSpacing: 4,
      landmarkClearance: 8,
      scaleMin: 0.8,
      scaleMax: 1.15,
    },
    {
      entries: LIVING_TREE_ENTRIES,
      count: PHASE0.SCATTER.TREE_FOREST_COUNT,
      heightMin: 0.42,
      heightMax: 1.1,
      minSpacing: 3.0,
      landmarkClearance: 5,
      scaleMin: 0.7,
      scaleMax: 1.25,
      region: { centerX: forestCx, centerZ: forestCz, radius: forestR },
    },
    {
      entries: ASSET_MANIFEST.plants.filter((p) => p.key === 'fern' || p.key === 'plant_1'),
      count: PHASE0.SCATTER.FOREST_UNDERSTORY_COUNT,
      heightMin: 0.42,
      heightMax: 1.05,
      minSpacing: 1.2,
      landmarkClearance: 4,
      scaleMin: 0.35,
      scaleMax: 0.85,
      surfaceLift: 0.05,
      region: { centerX: forestCx, centerZ: forestCz, radius: forestR * 0.92 },
    },
    {
      entries: ASSET_MANIFEST.rocks.filter((r) => r.biome === 'HILLS'),
      count: PHASE0.SCATTER.HILL_ROCKS_COUNT,
      heightMin: 1.1,
      heightMax: 1.9,
      minSpacing: 4,
      landmarkClearance: 6,
      scaleMin: 0.7,
      scaleMax: 1.1,
    },
    {
      entries: ASSET_MANIFEST.plants,
      count: PHASE0.SCATTER.SHORE_PLANTS_COUNT,
      heightMin: 0.08,
      heightMax: 0.42,
      minSpacing: 2,
      landmarkClearance: 5,
      scaleMin: 0.9,
      scaleMax: 1.2,
    },
    {
      entries: ASSET_MANIFEST.rocks.filter((r) => r.biome === 'MOUNTAIN'),
      count: PHASE0.SCATTER.MOUNTAIN_ROCKS_COUNT,
      heightMin: 1.9,
      heightMax: 2.5,
      minSpacing: 5,
      landmarkClearance: 6,
      scaleMin: 0.6,
      scaleMax: 1.0,
    },
  ];
}

export const PROP_TREE_KEYS = new Set<string>(ASSET_MANIFEST.trees.map((t) => t.key));
export const PROP_ROCK_KEYS = new Set<string>(ASSET_MANIFEST.rocks.map((r) => r.key));
