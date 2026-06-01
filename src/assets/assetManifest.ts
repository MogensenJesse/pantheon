// src/assets/assetManifest.ts
const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

const SCATTER_NATURE = encodePath('models/props/nature');
const LANDMARK_RUINS = encodePath('models/landmarks/ruins');
const LANDMARK_MOUNTAINS = encodePath('models/landmarks/mountains');

export type BiomeKey = 'FOREST' | 'HILLS' | 'SHORE' | 'MOUNTAIN';

export interface ScatterAssetEntry {
  key: string;
  path: string;
  biome: BiomeKey;
  weight: number;
}

import type { FoliagePackDef, FoliagePackKey, FoliageVariantEntry } from '../world/grass/foliageTypes';

export type GrassVariantEntry = FoliageVariantEntry;

/** @deprecated Use `grass_medium_01` pack registry key. */
export const GRASS_GLTF_KEY = 'grass_medium_01' as const;

const PACK_01_GLTF = encodePath('models/foliage/grass-medium-01/grass_medium_01_4k.gltf');
const PACK_01_ALPHA = encodePath(
  'models/foliage/grass-medium-01/textures/grass_medium_01_alpha_4k.png',
);
const PACK_02_GLTF = encodePath('models/foliage/grass-medium-02/grass_medium_02_4k.gltf');
const PACK_02_ALPHA = encodePath(
  'models/foliage/grass-medium-02/textures/grass_medium_02_alpha_4k.png',
);
const PACK_MOSS_GLTF = encodePath('models/foliage/moss/moss_01_4k.gltf');
const PACK_MOSS_ALPHA = encodePath('models/foliage/moss/textures/moss_01_alpha_4k.png');

/** @deprecated Use pack alpha paths in FOLIAGE_PACKS. */
export const GRASS_ALPHA_PATH = PACK_01_ALPHA;

function packVariants(
  packKey: FoliagePackKey,
  items: Array<{ key: string; meshName: string; class: 'cover' | 'accent'; weight: number }>,
): FoliageVariantEntry[] {
  return items.map((item) => ({ ...item, packKey }));
}

export const FOLIAGE_PACKS: Record<FoliagePackKey, FoliagePackDef> = {
  grass_medium_01: {
    registryKey: 'grass_medium_01',
    gltfPath: PACK_01_GLTF,
    alphaPath: PACK_01_ALPHA,
    preferredMeshForTextures: 'grass_medium_01_tiny_a_LOD0',
    variants: packVariants('grass_medium_01', [
      { key: 'g01_tiny_a', meshName: 'grass_medium_01_tiny_a_LOD0', class: 'cover', weight: 5 },
      { key: 'g01_tiny_b', meshName: 'grass_medium_01_tiny_b_LOD0', class: 'cover', weight: 5 },
      { key: 'g01_mid_a', meshName: 'grass_medium_01_mid_a_LOD0', class: 'accent', weight: 2 },
      { key: 'g01_mid_b', meshName: 'grass_medium_01_mid_b_LOD0', class: 'accent', weight: 2 },
      { key: 'g01_tall_a', meshName: 'grass_medium_01_tall_a_LOD0', class: 'accent', weight: 1 },
      { key: 'g01_tall_b', meshName: 'grass_medium_01_tall_b_LOD0', class: 'accent', weight: 1 },
    ]),
  },
  grass_medium_02: {
    registryKey: 'grass_medium_02',
    gltfPath: PACK_02_GLTF,
    alphaPath: PACK_02_ALPHA,
    preferredMeshForTextures: 'grass_medium_02_a',
    variants: packVariants('grass_medium_02', [
      { key: 'g02_a', meshName: 'grass_medium_02_a', class: 'cover', weight: 3 },
      { key: 'g02_b', meshName: 'grass_medium_02_b', class: 'cover', weight: 3 },
      { key: 'g02_c', meshName: 'grass_medium_02_c', class: 'cover', weight: 3 },
      { key: 'g02_d', meshName: 'grass_medium_02_d', class: 'accent', weight: 2 },
      { key: 'g02_e', meshName: 'grass_medium_02_e', class: 'accent', weight: 2 },
    ]),
  },
  moss_01: {
    registryKey: 'moss_01',
    gltfPath: PACK_MOSS_GLTF,
    alphaPath: PACK_MOSS_ALPHA,
    preferredMeshForTextures: 'moss_01_a_LOD0',
    variants: packVariants('moss_01', [
      { key: 'moss_a', meshName: 'moss_01_a_LOD0', class: 'cover', weight: 3 },
      { key: 'moss_b', meshName: 'moss_01_b_LOD0', class: 'cover', weight: 3 },
      { key: 'moss_c', meshName: 'moss_01_c_LOD0', class: 'cover', weight: 3 },
      { key: 'moss_d', meshName: 'moss_01_d_LOD0', class: 'cover', weight: 3 },
      { key: 'moss_e', meshName: 'moss_01_e_LOD0', class: 'cover', weight: 3 },
      { key: 'moss_f', meshName: 'moss_01_f_LOD0', class: 'cover', weight: 3 },
      { key: 'moss_g', meshName: 'moss_01_g_LOD0', class: 'cover', weight: 3 },
      { key: 'moss_h', meshName: 'moss_01_h_LOD0', class: 'cover', weight: 2 },
      { key: 'moss_i', meshName: 'moss_01_i_LOD0', class: 'cover', weight: 2 },
      { key: 'moss_j', meshName: 'moss_01_j_LOD0', class: 'cover', weight: 2 },
      { key: 'moss_tall_a', meshName: 'moss_01_tall_a_LOD0', class: 'accent', weight: 1 },
      { key: 'moss_tall_b', meshName: 'moss_01_tall_b_LOD0', class: 'accent', weight: 1 },
    ]),
  },
};

const ALL_FOLIAGE_VARIANTS = Object.values(FOLIAGE_PACKS).flatMap((p) => p.variants);

export const ASSET_MANIFEST = {
  trees: [
    {
      key: 'common_tree_1',
      path: `${SCATTER_NATURE}/CommonTree_1.gltf`,
      biome: 'FOREST' as const,
      weight: 3,
    },
    {
      key: 'common_tree_2',
      path: `${SCATTER_NATURE}/CommonTree_2.gltf`,
      biome: 'FOREST' as const,
      weight: 3,
    },
    {
      key: 'common_tree_3',
      path: `${SCATTER_NATURE}/CommonTree_3.gltf`,
      biome: 'FOREST' as const,
      weight: 3,
    },
    {
      key: 'common_tree_4',
      path: `${SCATTER_NATURE}/CommonTree_4.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'common_tree_5',
      path: `${SCATTER_NATURE}/CommonTree_5.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'twisted_tree_1',
      path: `${SCATTER_NATURE}/TwistedTree_1.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'twisted_tree_2',
      path: `${SCATTER_NATURE}/TwistedTree_2.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'twisted_tree_3',
      path: `${SCATTER_NATURE}/TwistedTree_3.gltf`,
      biome: 'FOREST' as const,
      weight: 2,
    },
    {
      key: 'twisted_tree_4',
      path: `${SCATTER_NATURE}/TwistedTree_4.gltf`,
      biome: 'FOREST' as const,
      weight: 1,
    },
    { key: 'pine_1', path: `${SCATTER_NATURE}/Pine_1.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_2', path: `${SCATTER_NATURE}/Pine_2.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_3', path: `${SCATTER_NATURE}/Pine_3.gltf`, biome: 'HILLS' as const, weight: 2 },
    { key: 'pine_4', path: `${SCATTER_NATURE}/Pine_4.gltf`, biome: 'HILLS' as const, weight: 1 },
    { key: 'pine_5', path: `${SCATTER_NATURE}/Pine_5.gltf`, biome: 'HILLS' as const, weight: 1 },
  ],
  rocks: [
    {
      key: 'rock_medium_1',
      path: `${SCATTER_NATURE}/Rock_Medium_1.gltf`,
      biome: 'HILLS' as const,
      weight: 3,
    },
    {
      key: 'rock_medium_2',
      path: `${SCATTER_NATURE}/Rock_Medium_2.gltf`,
      biome: 'HILLS' as const,
      weight: 3,
    },
    {
      key: 'rock_medium_3',
      path: `${SCATTER_NATURE}/Rock_Medium_3.gltf`,
      biome: 'MOUNTAIN' as const,
      weight: 2,
    },
  ],
  plants: [
    { key: 'bush', path: `${SCATTER_NATURE}/Bush_Common.gltf`, biome: 'SHORE' as const, weight: 3 },
    { key: 'fern', path: `${SCATTER_NATURE}/Fern_1.gltf`, biome: 'FOREST' as const, weight: 2 },
    { key: 'clover_1', path: `${SCATTER_NATURE}/Clover_1.gltf`, biome: 'SHORE' as const, weight: 2 },
    { key: 'plant_1', path: `${SCATTER_NATURE}/Plant_1.gltf`, biome: 'FOREST' as const, weight: 1 },
  ],
  landmarks: {
    ancientOak: { key: 'ancient_oak', path: `${SCATTER_NATURE}/TwistedTree_5.gltf` },
    springPebbles: [
      { key: 'pebble_1', path: `${SCATTER_NATURE}/Pebble_Round_1.gltf` },
      { key: 'pebble_2', path: `${SCATTER_NATURE}/Pebble_Round_2.gltf` },
      { key: 'pebble_3', path: `${SCATTER_NATURE}/Pebble_Round_3.gltf` },
      { key: 'pebble_4', path: `${SCATTER_NATURE}/Pebble_Round_4.gltf` },
      { key: 'pebble_5', path: `${SCATTER_NATURE}/Pebble_Round_5.gltf` },
    ],
    cairnRocks: [
      { key: 'cairn_rock_1', path: `${SCATTER_NATURE}/Rock_Medium_1.gltf` },
      { key: 'cairn_rock_2', path: `${SCATTER_NATURE}/Rock_Medium_2.gltf` },
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

/**
 * Canopy trees with foliage (CommonTree_*, TwistedTree_*, Pine_*).
 * DeadTree_* assets are bark-only in the pack and are never listed here.
 */
export const FOLIAGE_COVER_VARIANTS = ALL_FOLIAGE_VARIANTS.filter((v) => v.class === 'cover');
export const FOLIAGE_ACCENT_VARIANTS = ALL_FOLIAGE_VARIANTS.filter((v) => v.class === 'accent');

/** @deprecated Use FOLIAGE_COVER_VARIANTS. */
export const GRASS_COVER_VARIANTS = FOLIAGE_COVER_VARIANTS;
/** @deprecated Use FOLIAGE_ACCENT_VARIANTS. */
export const GRASS_ACCENT_VARIANTS = FOLIAGE_ACCENT_VARIANTS;

export function foliageVariantsForClass(className: 'cover' | 'accent'): readonly FoliageVariantEntry[] {
  return className === 'cover' ? FOLIAGE_COVER_VARIANTS : FOLIAGE_ACCENT_VARIANTS;
}

export function foliageVariantsForPackAndClass(
  packKey: FoliagePackKey,
  className: 'cover' | 'accent',
): readonly FoliageVariantEntry[] {
  return FOLIAGE_PACKS[packKey].variants.filter((v) => v.class === className);
}

export const LIVING_TREE_ENTRIES = ASSET_MANIFEST.trees.filter((e) => {
  const k = e.key;
  return k.startsWith('common_tree_') || k.startsWith('twisted_tree_') || k.startsWith('pine_');
});

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

  for (const pack of Object.values(FOLIAGE_PACKS)) {
    push(pack.registryKey, pack.gltfPath);
  }

  return entries;
}
