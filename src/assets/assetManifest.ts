// src/assets/assetManifest.ts
import { VISUAL } from '../config/visualTuning';

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

const GLTF_ROOT = encodePath('models/glTF');
const gltf = (file: string) => `${GLTF_ROOT}/${file}.gltf`;

export type BiomeKey = 'FOREST' | 'HILLS' | 'SHORE' | 'MOUNTAIN';

export interface NaturePropAssetEntry {
  key: string;
  path: string;
  biome: BiomeKey;
  weight: number;
}

function prop(key: string, file: string, biome: BiomeKey, weight: number): NaturePropAssetEntry {
  return { key, path: gltf(file), biome, weight };
}

function numberedProps(
  keyPrefix: string,
  filePrefix: string,
  count: number,
  biome: BiomeKey,
  weight: number,
): NaturePropAssetEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return prop(`${keyPrefix}_${n}`, `${filePrefix}_${n}`, biome, weight);
  });
}

export const ASSET_MANIFEST = {
  trees: [
    ...numberedProps('common_tree', 'CommonTree', 5, 'FOREST', 3),
    ...numberedProps('twisted_tree', 'TwistedTree', 5, 'FOREST', 2),
    ...numberedProps('pine', 'Pine', 5, 'HILLS', 2),
  ],
  dead_trees: numberedProps('dead_tree', 'DeadTree', 5, 'FOREST', 1),
  rocks: numberedProps('rock_medium', 'Rock_Medium', 3, 'HILLS', 3),
  rock_paths: [
    ...numberedProps('rock_path_round_small', 'RockPath_Round_Small', 3, 'HILLS', 2),
    prop('rock_path_round_wide', 'RockPath_Round_Wide', 'HILLS', 2),
    prop('rock_path_round_thin', 'RockPath_Round_Thin', 'HILLS', 1),
    ...numberedProps('rock_path_square_small', 'RockPath_Square_Small', 3, 'HILLS', 2),
    prop('rock_path_square_wide', 'RockPath_Square_Wide', 'HILLS', 2),
    prop('rock_path_square_thin', 'RockPath_Square_Thin', 'HILLS', 1),
  ],
  plants: [
    prop('bush', 'Bush_Common', 'SHORE', 3),
    prop('bush_flowers', 'Bush_Common_Flowers', 'SHORE', 2),
    prop('fern', 'Fern_1', 'FOREST', 2),
    prop('clover_1', 'Clover_1', 'SHORE', 2),
    prop('clover_2', 'Clover_2', 'SHORE', 1),
    prop('plant_1', 'Plant_1', 'FOREST', 1),
    prop('plant_1_big', 'Plant_1_Big', 'FOREST', 1),
    prop('plant_7', 'Plant_7', 'FOREST', 1),
    prop('plant_7_big', 'Plant_7_Big', 'FOREST', 1),
  ],
  flowers: [
    prop('flower_3_group', 'Flower_3_Group', 'FOREST', 1),
    prop('flower_3_single', 'Flower_3_Single', 'FOREST', 1),
    prop('flower_4_group', 'Flower_4_Group', 'FOREST', 1),
    prop('flower_4_single', 'Flower_4_Single', 'FOREST', 1),
    ...numberedProps('petal', 'Petal', 5, 'FOREST', 1),
  ],
  mushrooms: [
    prop('mushroom_common', 'Mushroom_Common', 'FOREST', 2),
    prop('mushroom_laetiporus', 'Mushroom_Laetiporus', 'FOREST', 1),
  ],
  pebbles: [
    ...numberedProps('pebble_round', 'Pebble_Round', 5, 'SHORE', 2),
    ...numberedProps('pebble_square', 'Pebble_Square', 6, 'SHORE', 1),
  ],
} as const;

const PROP_ASSET_GROUPS: readonly (readonly NaturePropAssetEntry[])[] = [
  ASSET_MANIFEST.trees,
  ASSET_MANIFEST.dead_trees,
  ASSET_MANIFEST.rocks,
  ASSET_MANIFEST.rock_paths,
  ASSET_MANIFEST.plants,
  ASSET_MANIFEST.flowers,
  ASSET_MANIFEST.mushrooms,
  ASSET_MANIFEST.pebbles,
];

export function allPropAssetEntries(): NaturePropAssetEntry[] {
  return PROP_ASSET_GROUPS.flatMap((group) => [...group]);
}

export type AssetRegistry = Map<string, import('three').Object3D>;

export function collectAllAssetPaths(): Array<{ key: string; path: string }> {
  return allPropAssetEntries().map(({ key, path }) => ({ key, path }));
}

/** Environment textures preloaded during play bootstrap (when volumetric clouds enabled). */
export function collectEnvironmentAssetPaths(): string[] {
  if (!VISUAL.sky.volumetricClouds.enabled) {
    return [];
  }
  return [encodePath('textures/environment/cloud-perlin-worley.bin')];
}
