// src/assets/assetManifest.ts
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

const NATURE = encodePath('models/Stylized Nature Megakit/glTF');
const RUINS = encodePath('models/converted');
const RTS = encodePath('models/Ultimate Fantasy RTS - Aug 2022/glTF');

export type BiomeKey = 'FOREST' | 'HILLS' | 'SHORE' | 'MOUNTAIN';

export interface ScatterAssetEntry {
  key: string;
  path: string;
  biome: BiomeKey;
  weight: number;
}

export interface LandmarkAssetEntry {
  key: string;
  path: string;
}

export const ASSET_MANIFEST = {
  trees: [
    { key: 'common_tree_1', path: `${NATURE}/CommonTree_1.gltf`, biome: 'FOREST' as const, weight: 3 },
    { key: 'common_tree_2', path: `${NATURE}/CommonTree_2.gltf`, biome: 'FOREST' as const, weight: 3 },
    { key: 'common_tree_3', path: `${NATURE}/CommonTree_3.gltf`, biome: 'FOREST' as const, weight: 3 },
    { key: 'common_tree_4', path: `${NATURE}/CommonTree_4.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'common_tree_5', path: `${NATURE}/CommonTree_5.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'twisted_tree_1', path: `${NATURE}/TwistedTree_1.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'twisted_tree_2', path: `${NATURE}/TwistedTree_2.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'twisted_tree_3', path: `${NATURE}/TwistedTree_3.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'twisted_tree_4', path: `${NATURE}/TwistedTree_4.gltf`, biome: 'FOREST' as const, weight: 1 },
    { key: 'pine_1', path: `${NATURE}/Pine_1.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_2', path: `${NATURE}/Pine_2.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_3', path: `${NATURE}/Pine_3.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_4', path: `${NATURE}/Pine_4.gltf`, biome: 'HILLS' as const, weight: 1 },
    { key: 'pine_5', path: `${NATURE}/Pine_5.gltf`, biome: 'HILLS' as const, weight: 1 },
  ],
  rocks: [
    { key: 'rock_medium_1', path: `${NATURE}/Rock_Medium_1.gltf`, biome: 'HILLS' as const, weight: 3 },
    { key: 'rock_medium_2', path: `${NATURE}/Rock_Medium_2.gltf`, biome: 'HILLS' as const, weight: 3 },
    { key: 'rock_medium_3', path: `${NATURE}/Rock_Medium_3.gltf`, biome: 'MOUNTAIN' as const, weight: 2 },
  ],
  plants: [
    { key: 'bush', path: `${NATURE}/Bush_Common.gltf`, biome: 'SHORE' as const, weight: 3 },
    { key: 'fern', path: `${NATURE}/Fern_1.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'clover_1', path: `${NATURE}/Clover_1.gltf`, biome: 'SHORE' as const, weight: 2 },
    { key: 'plant_1', path: `${NATURE}/Plant_1.gltf`, biome: 'FOREST' as const, weight: 1 },
  ],
  grass: [
    { key: 'grass_common_short', path: `${NATURE}/Grass_Common_Short.gltf`, biome: 'SHORE' as const, weight: 3 },
    { key: 'grass_common_tall', path: `${NATURE}/Grass_Common_Tall.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'grass_wispy_short', path: `${NATURE}/Grass_Wispy_Short.gltf`, biome: 'SHORE' as const, weight: 3 },
    { key: 'grass_wispy_tall', path: `${NATURE}/Grass_Wispy_Tall.gltf`, biome: 'HILLS' as const, weight: 2 },
  ],
  landmarks: {
    ancientOak: { key: 'ancient_oak', path: `${NATURE}/TwistedTree_5.gltf` },
    springPebbles: [
      { key: 'pebble_1', path: `${NATURE}/Pebble_Round_1.gltf` },
      { key: 'pebble_2', path: `${NATURE}/Pebble_Round_2.gltf` },
      { key: 'pebble_3', path: `${NATURE}/Pebble_Round_3.gltf` },
      { key: 'pebble_4', path: `${NATURE}/Pebble_Round_4.gltf` },
      { key: 'pebble_5', path: `${NATURE}/Pebble_Round_5.gltf` },
    ],
    cairnRocks: [
      { key: 'cairn_rock_1', path: `${NATURE}/Rock_Medium_1.gltf` },
      { key: 'cairn_rock_2', path: `${NATURE}/Rock_Medium_2.gltf` },
    ],
    stones: [
      { key: 'stone_0', path: `${RUINS}/Column_Round.glb` },
      { key: 'stone_1', path: `${RUINS}/Column_Square.glb` },
      { key: 'stone_2', path: `${RUINS}/Column_Round.glb` },
      { key: 'stone_3', path: `${RUINS}/Support_Tall.glb` },
      { key: 'stone_4', path: `${RUINS}/Column_Square.glb` },
    ],
    temple: [
      { key: 'temple_wall_1', path: `${RUINS}/Wall_Broken.glb` },
      { key: 'temple_wall_2', path: `${RUINS}/Wall_ArchRound_Broken.glb` },
      { key: 'temple_arch', path: `${RUINS}/Arch_Round.glb` },
      { key: 'temple_floor', path: `${RUINS}/Floor_Standard.glb` },
      { key: 'statue_fox', path: `${RUINS}/Statue_Fox.glb` },
      { key: 'statue_stag', path: `${RUINS}/Statue_Stag.glb` },
    ],
    mountains: [
      { key: 'mountain_group_1', path: `${RTS}/Mountain_Group_1.gltf` },
      { key: 'mountain_group_2', path: `${RTS}/Mountain_Group_2.gltf` },
      { key: 'mountain_single',  path: `${RTS}/Mountain_Single.gltf` },
      { key: 'mountain_large',   path: `${RTS}/MountainLarge_Single.gltf` },
    ],
  },
} as const;

/**
 * Canopy trees with foliage (CommonTree_*, TwistedTree_*, Pine_*).
 * DeadTree_* assets are bark-only in the pack and are never listed here.
 */
export const LIVING_TREE_ENTRIES = ASSET_MANIFEST.trees.filter((e) => {
  const k = e.key;
  return (
    k.startsWith('common_tree_') ||
    k.startsWith('twisted_tree_') ||
    k.startsWith('pine_')
  );
});

export type AssetRegistry = Map<string, import('three').Object3D>;

export function collectAllAssetPaths(): Array<{ key: string; path: string }> {
  const entries: Array<{ key: string; path: string }> = [];
  const push = (key: string, path: string) => entries.push({ key, path });

  for (const group of [
    ASSET_MANIFEST.trees,
    ASSET_MANIFEST.rocks,
    ASSET_MANIFEST.plants,
    ASSET_MANIFEST.grass,
  ]) {
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
