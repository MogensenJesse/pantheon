// src/assets/assetManifest.ts
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

const NATURE_PROPS_ROOT = encodePath('models/props/nature');
const LANDMARK_RUINS = encodePath('models/landmarks/ruins');
const LANDMARK_MOUNTAINS = encodePath('models/landmarks/mountains');

export type BiomeKey = 'FOREST' | 'HILLS' | 'SHORE' | 'MOUNTAIN';

export interface NaturePropAssetEntry {
  key: string;
  path: string;
  biome: BiomeKey;
  weight: number;
}

/** @deprecated Use NaturePropAssetEntry */
export type ScatterAssetEntry = NaturePropAssetEntry;

export const ASSET_MANIFEST = {
  trees: [
    {
      key: 'common_tree_1',
      path: `${NATURE_PROPS_ROOT}/CommonTree_1.gltf`,
      biome: 'FOREST' as const,
      weight: 3,
    },
    {
      key: 'common_tree_2',
      path: `${NATURE_PROPS_ROOT}/CommonTree_2.gltf`,
      biome: 'FOREST' as const,
      weight: 3,
    },
    {
      key: 'common_tree_3',
      path: `${NATURE_PROPS_ROOT}/CommonTree_3.gltf`,
      biome: 'FOREST' as const,
      weight: 3,
    },
    {
      key: 'common_tree_4',
      path: `${NATURE_PROPS_ROOT}/CommonTree_4.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'common_tree_5',
      path: `${NATURE_PROPS_ROOT}/CommonTree_5.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'twisted_tree_1',
      path: `${NATURE_PROPS_ROOT}/TwistedTree_1.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'twisted_tree_2',
      path: `${NATURE_PROPS_ROOT}/TwistedTree_2.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'twisted_tree_3',
      path: `${NATURE_PROPS_ROOT}/TwistedTree_3.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'twisted_tree_4',
      path: `${NATURE_PROPS_ROOT}/TwistedTree_4.gltf`,
      biome: 'FOREST' as const,
      weight: 1,
    },
    { key: 'pine_1', path: `${NATURE_PROPS_ROOT}/Pine_1.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_2', path: `${NATURE_PROPS_ROOT}/Pine_2.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_3', path: `${NATURE_PROPS_ROOT}/Pine_3.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_4', path: `${NATURE_PROPS_ROOT}/Pine_4.gltf`, biome: 'HILLS' as const, weight: 1 },
    { key: 'pine_5', path: `${NATURE_PROPS_ROOT}/Pine_5.gltf`, biome: 'HILLS' as const, weight: 1 },
  ],
  rocks: [
    {
      key: 'rock_medium_1',
      path: `${NATURE_PROPS_ROOT}/Rock_Medium_1.gltf`,
      biome: 'HILLS' as const,
      weight: 3,
    },
    {
      key: 'rock_medium_2',
      path: `${NATURE_PROPS_ROOT}/Rock_Medium_2.gltf`,
      biome: 'HILLS' as const,
      weight: 3,
    },
    {
      key: 'rock_medium_3',
      path: `${NATURE_PROPS_ROOT}/Rock_Medium_3.gltf`,
      biome: 'MOUNTAIN' as const,
      weight: 2,
    },
  ],
  plants: [
    { key: 'bush', path: `${NATURE_PROPS_ROOT}/Bush_Common.gltf`, biome: 'SHORE' as const, weight: 3 },
    { key: 'fern', path: `${NATURE_PROPS_ROOT}/Fern_1.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'clover_1', path: `${NATURE_PROPS_ROOT}/Clover_1.gltf`, biome: 'SHORE' as const, weight: 2 },
    { key: 'plant_1', path: `${NATURE_PROPS_ROOT}/Plant_1.gltf`, biome: 'FOREST' as const, weight: 1 },
  ],
  landmarks: {
    ancientOak: { key: 'ancient_oak', path: `${NATURE_PROPS_ROOT}/TwistedTree_5.gltf` },
    springPebbles: [
      { key: 'pebble_1', path: `${NATURE_PROPS_ROOT}/Pebble_Round_1.gltf` },
      { key: 'pebble_2', path: `${NATURE_PROPS_ROOT}/Pebble_Round_2.gltf` },
      { key: 'pebble_3', path: `${NATURE_PROPS_ROOT}/Pebble_Round_3.gltf` },
      { key: 'pebble_4', path: `${NATURE_PROPS_ROOT}/Pebble_Round_4.gltf` },
      { key: 'pebble_5', path: `${NATURE_PROPS_ROOT}/Pebble_Round_5.gltf` },
    ],
    cairnRocks: [
      { key: 'cairn_rock_1', path: `${NATURE_PROPS_ROOT}/Rock_Medium_1.gltf` },
      { key: 'cairn_rock_2', path: `${NATURE_PROPS_ROOT}/Rock_Medium_2.gltf` },
    ],
    stones: [
      { key: 'stone_0', path: `${LANDMARK_RUINS}/Column_Round.glb` },
      { key: 'stone_1', path: `${LANDMARK_RUINS}/Column_Square.glb` },
      { key: 'stone_2', path: `${LANDMARK_RUINS}/Column_Round.glb` },
      { key: 'stone_3', path: `${LANDMARK_RUINS}/Support_Tall.glb` },
      { key: 'stone_4', path: `${LANDMARK_RUINS}/Column_Square.glb` },
    ],
    temple: [
      { key: 'temple_wall_1', path: `${LANDMARK_RUINS}/Wall_Broken.glb` },
      { key: 'temple_wall_2', path: `${LANDMARK_RUINS}/Wall_ArchRound_Broken.glb` },
      { key: 'temple_arch', path: `${LANDMARK_RUINS}/Arch_Round.glb` },
      { key: 'temple_floor', path: `${LANDMARK_RUINS}/Floor_Standard.glb` },
      { key: 'statue_fox', path: `${LANDMARK_RUINS}/Statue_Fox.glb` },
      { key: 'statue_stag', path: `${LANDMARK_RUINS}/Statue_Stag.glb` },
    ],
    mountains: [
      { key: 'mountain_group_1', path: `${LANDMARK_MOUNTAINS}/Mountain_Group_1.gltf` },
      { key: 'mountain_group_2', path: `${LANDMARK_MOUNTAINS}/Mountain_Group_2.gltf` },
      { key: 'mountain_single', path: `${LANDMARK_MOUNTAINS}/Mountain_Single.gltf` },
      { key: 'mountain_large', path: `${LANDMARK_MOUNTAINS}/MountainLarge_Single.gltf` },
    ],
  },
} as const;

export type AssetRegistry = Map<string, import('three').Object3D>;

export function collectAllAssetPaths(): Array<{ key: string; path: string }> {
  const entries: Array<{ key: string; path: string }> = [];
  const push = (key: string, path: string) => entries.push({ key, path });

  for (const group of [ASSET_MANIFEST.trees, ASSET_MANIFEST.rocks, ASSET_MANIFEST.plants]) {
    for (const item of group) push(item.key, item.path);
  }

  const lm = ASSET_MANIFEST.landmarks;
  push(lm.ancientOak.key, lm.ancientOak.path);
  for (const p of lm.springPebbles) push(p.key, p.path);
  for (const r of lm.cairnRocks) push(r.key, r.path);
  for (const s of lm.stones) push(s.key, s.path);
  for (const t of lm.temple) push(t.key, t.path);
  for (const m of lm.mountains) push(m.key, m.path);

  return entries;
}
