// src/assets/assetManifest.ts
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

const glb = (family: string, file: string) => encodePath(`models/${family}/${file}.glb`);

/** Multi-prop packs under `public/models/<pack>/scene.glb`. */
const packScene = (pack: string) => encodePath(`models/${pack}/scene.glb`);

export type BiomeKey = 'FOREST' | 'HILLS' | 'SHORE' | 'MOUNTAIN';

export interface PropAssetExtract {
  /** Exact `Object3D.name` to pull from the loaded scene. */
  nodeName: string;
  /** 0-based index among nodes with this name (depth-first). Default 0. */
  index?: number;
}

export interface NaturePropAssetEntry {
  key: string;
  path: string;
  biome: BiomeKey;
  weight: number;
  /** When set, registry stores a recentered subtree instead of the whole scene. */
  extract?: PropAssetExtract;
  /**
   * When set, uniformly scale the loaded (extracted) root so its AABB height
   * matches this world-metre size. Used for packs whose units dwarf the nature
   * glTF set (~2.3 m medium rocks).
   */
  targetHeightM?: number;
}

function prop(
  key: string,
  family: string,
  file: string,
  biome: BiomeKey,
  weight: number,
): NaturePropAssetEntry {
  return { key, path: glb(family, file), biome, weight };
}

function numberedProps(
  keyPrefix: string,
  family: string,
  filePrefix: string,
  count: number,
  biome: BiomeKey,
  weight: number,
): NaturePropAssetEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return prop(`${keyPrefix}_${n}`, family, `${filePrefix}_${n}`, biome, weight);
  });
}

/** Match shipped `Rock_Medium_1` AABB height; smaller variants step down. */
const STONE_BIG_HEIGHT_M = 2.3;
const STONE_MID_HEIGHT_M = 1.4;
const STONE_SMALL_HEIGHT_M = 0.7;
const STONE_RUNIC_HEIGHT_M = 2;
const STONE_MISC_HEIGHT_M = 1;

function packProp(
  key: string,
  pack: string,
  biome: BiomeKey,
  weight: number,
  opts?: {
    nodeName?: string;
    index?: number;
    targetHeightM?: number;
  },
): NaturePropAssetEntry {
  const { targetHeightM, nodeName, index } = opts ?? {};
  const extract =
    nodeName !== undefined ? { nodeName, ...(index !== undefined ? { index } : {}) } : undefined;
  return { key, path: packScene(pack), biome, weight, extract, targetHeightM };
}

/** Stone pack RootNode children → individual rock props (two Mid_4 pieces). */
function stonePackEntries(): NaturePropAssetEntry[] {
  const pack = 'stone-pack';
  const pieces: Array<{ key: string; nodeName: string; index?: number }> = [
    { key: 'stone_mid_4a', nodeName: 'Mid_4', index: 0 },
    { key: 'stone_big_5', nodeName: 'Big_5' },
    { key: 'stone_small_8', nodeName: 'Small_8' },
    { key: 'stone_mid_5', nodeName: 'Mid_5' },
    { key: 'stone_big_1', nodeName: 'BIG_1' },
    { key: 'stone_big_2', nodeName: 'Big_2' },
    { key: 'stone_big_3', nodeName: 'Big_3' },
    { key: 'stone_big_4', nodeName: 'Big_4' },
    { key: 'stone_mid_1', nodeName: 'Mid_1' },
    { key: 'stone_mid_2', nodeName: 'Mid_2' },
    { key: 'stone_mid_3', nodeName: 'Mid_3' },
    { key: 'stone_mid_4b', nodeName: 'Mid_4', index: 1 },
    { key: 'stone_small_1', nodeName: 'Small_1' },
    { key: 'stone_small_2', nodeName: 'Small_2' },
    { key: 'stone_small_3', nodeName: 'Small_3' },
    { key: 'stone_small_4', nodeName: 'Small_4' },
    { key: 'stone_small_5', nodeName: 'Small_5' },
    { key: 'stone_small_6', nodeName: 'Small_6' },
    { key: 'stone_small_7', nodeName: 'Small_7' },
    { key: 'stone_runic_1', nodeName: 'Runic_1' },
    { key: 'stone_runic_2', nodeName: 'Runic_2' },
    { key: 'stone_runic_3', nodeName: 'Runic_3' },
    { key: 'stone_runic_4', nodeName: 'Runic_4' },
    { key: 'stone_runic_5', nodeName: 'Runic_5' },
    { key: 'stone_runic_6', nodeName: 'Runic_6' },
    { key: 'stone_runic_7', nodeName: 'Runic_7' },
    { key: 'stone_p1', nodeName: 'p1' },
    { key: 'stone_p2', nodeName: 'p2' },
  ];
  return pieces.map(({ key, nodeName, index }) => {
    let targetHeightM = STONE_MID_HEIGHT_M;
    if (key.startsWith('stone_big_')) targetHeightM = STONE_BIG_HEIGHT_M;
    else if (key.startsWith('stone_small_')) targetHeightM = STONE_SMALL_HEIGHT_M;
    else if (key.startsWith('stone_runic_')) targetHeightM = STONE_RUNIC_HEIGHT_M;
    else if (key === 'stone_p1' || key === 'stone_p2') targetHeightM = STONE_MISC_HEIGHT_M;
    return packProp(key, pack, 'HILLS', 2, { nodeName, index, targetHeightM });
  });
}

export const ASSET_MANIFEST = {
  trees: [
    ...numberedProps('common_tree', 'common-tree', 'CommonTree', 5, 'FOREST', 3),
    ...numberedProps('twisted_tree', 'twisted-tree', 'TwistedTree', 5, 'FOREST', 2),
    ...numberedProps('pine', 'pine', 'Pine', 5, 'HILLS', 2),
  ],
  dead_trees: numberedProps('dead_tree', 'dead-tree', 'DeadTree', 5, 'FOREST', 1),
  rocks: [
    ...numberedProps('rock_medium', 'rock-medium', 'Rock_Medium', 3, 'HILLS', 3),
    ...stonePackEntries(),
  ],
  rock_paths: [
    ...numberedProps('rock_path_round_small', 'rock-path', 'RockPath_Round_Small', 3, 'HILLS', 2),
    prop('rock_path_round_wide', 'rock-path', 'RockPath_Round_Wide', 'HILLS', 2),
    prop('rock_path_round_thin', 'rock-path', 'RockPath_Round_Thin', 'HILLS', 1),
    ...numberedProps('rock_path_square_small', 'rock-path', 'RockPath_Square_Small', 3, 'HILLS', 2),
    prop('rock_path_square_wide', 'rock-path', 'RockPath_Square_Wide', 'HILLS', 2),
    prop('rock_path_square_thin', 'rock-path', 'RockPath_Square_Thin', 'HILLS', 1),
  ],
  plants: [
    prop('bush', 'bush', 'Bush_Common', 'SHORE', 3),
    prop('bush_flowers', 'bush', 'Bush_Common_Flowers', 'SHORE', 2),
    prop('fern', 'fern', 'Fern_1', 'FOREST', 2),
    prop('clover_1', 'clover', 'Clover_1', 'SHORE', 2),
    prop('clover_2', 'clover', 'Clover_2', 'SHORE', 1),
    prop('plant_1', 'plant-1', 'Plant_1', 'FOREST', 1),
    prop('plant_1_big', 'plant-1', 'Plant_1_Big', 'FOREST', 1),
    prop('plant_7', 'plant-7', 'Plant_7', 'FOREST', 1),
    prop('plant_7_big', 'plant-7', 'Plant_7_Big', 'FOREST', 1),
  ],
  flowers: [
    prop('flower_3_group', 'flower-3', 'Flower_3_Group', 'FOREST', 1),
    prop('flower_3_single', 'flower-3', 'Flower_3_Single', 'FOREST', 1),
    prop('flower_4_group', 'flower-4', 'Flower_4_Group', 'FOREST', 1),
    prop('flower_4_single', 'flower-4', 'Flower_4_Single', 'FOREST', 1),
    ...numberedProps('petal', 'petal', 'Petal', 5, 'FOREST', 1),
  ],
  mushrooms: [
    prop('mushroom_common', 'mushroom', 'Mushroom_Common', 'FOREST', 2),
    prop('mushroom_laetiporus', 'mushroom', 'Mushroom_Laetiporus', 'FOREST', 1),
  ],
  pebbles: [
    ...numberedProps('pebble_round', 'pebble-round', 'Pebble_Round', 5, 'SHORE', 2),
    ...numberedProps('pebble_square', 'pebble-square', 'Pebble_Square', 6, 'SHORE', 1),
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

/** One GLTF load per unique path, with all registry registrations for that file. */
export function collectAssetLoadJobs(): Array<{
  path: string;
  entries: NaturePropAssetEntry[];
}> {
  const byPath = new Map<string, NaturePropAssetEntry[]>();
  for (const entry of allPropAssetEntries()) {
    const list = byPath.get(entry.path);
    if (list) list.push(entry);
    else byPath.set(entry.path, [entry]);
  }
  return [...byPath.entries()].map(([path, entries]) => ({ path, entries }));
}
