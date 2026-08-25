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
   * Artist-authored mid LOD inside the same glTF (e.g. `Pine_big_1_LOD1`).
   * When set, skips `_lod1.glb` sibling load for this entry.
   */
  extractLod1?: PropAssetExtract;
  /**
   * Artist-authored far LOD inside the same glTF (e.g. `Pine_big_1_LOD2`).
   * When set, skips `_lod2.glb` sibling load for this entry.
   */
  extractLod2?: PropAssetExtract;
  /**
   * When set, uniformly scale the loaded (extracted) root so its AABB height
   * matches this world-metre size. Used for packs whose units dwarf the nature
   * glTF set (~2.3 m medium rocks).
   */
  targetHeightM?: number;
  /** Source glTF up axis before recentering. Default `Y` (Three.js world up). */
  upAxis?: 'Y' | 'Z';
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

/** Tree packs ship LOD0–LOD2 nodes inside one scene; billboard LOD3 is unused. */
const TREE_HEIGHT_M = {
  sapling: 2.5,
  small: 5,
  medium: 8,
  large: 11,
  big: 14,
  fir: 10,
} as const;

function packTreeProp(
  key: string,
  pack: string,
  baseNode: string,
  biome: BiomeKey,
  weight: number,
  targetHeightM: number,
  upAxis: 'Y' | 'Z' = 'Y',
): NaturePropAssetEntry {
  return {
    key,
    path: packScene(pack),
    biome,
    weight,
    extract: { nodeName: `${baseNode}_LOD0` },
    extractLod1: { nodeName: `${baseNode}_LOD1` },
    extractLod2: { nodeName: `${baseNode}_LOD2` },
    targetHeightM,
    upAxis,
  };
}

function firPackEntries(): NaturePropAssetEntry[] {
  const pack = 'fir-pack';
  const bases = ['Christmas tree', 'Christmas tree_2', 'Christmas tree_3'] as const;
  return bases.map((base, i) =>
    packTreeProp(`fir_${i + 1}`, pack, base, 'FOREST', 3, TREE_HEIGHT_M.fir),
  );
}

function pinePackEntries(): NaturePropAssetEntry[] {
  const sizes = ['sapling', 'small', 'medium', 'large', 'big'] as const;
  const entries: NaturePropAssetEntry[] = [];
  for (const size of sizes) {
    for (let n = 1; n <= 3; n++) {
      const base = `Pine_${size}_${n}`;
      entries.push(
        packTreeProp(`pine_${size}_${n}`, 'pine-pack', base, 'HILLS', 2, TREE_HEIGHT_M[size], 'Z'),
      );
    }
  }
  return entries;
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
  trees: [...firPackEntries(), ...pinePackEntries()],
  rocks: [
    ...numberedProps('rock_medium', 'rock-medium', 'Rock_Medium', 3, 'HILLS', 3),
    ...stonePackEntries(),
  ],
} as const;

const PROP_ASSET_GROUPS: readonly (readonly NaturePropAssetEntry[])[] = [
  ASSET_MANIFEST.trees,
  ASSET_MANIFEST.rocks,
];

export function allPropAssetEntries(): NaturePropAssetEntry[] {
  return PROP_ASSET_GROUPS.flatMap((group) => [...group]);
}

/** Per-prop LOD scenes (lod1/lod2 fall back to lod0 when siblings are missing). */
export interface PropLodAsset {
  lod0: import('three').Object3D;
  lod1: import('three').Object3D;
  lod2: import('three').Object3D;
}

export type AssetRegistry = Map<string, PropLodAsset>;

/** Canonical lod0 path → mid/far sibling paths (`Name.glb` → `Name_lod1.glb`). */
export function lodSiblingPath(canonicalPath: string, lod: 1 | 2): string {
  if (!/\.glb$/i.test(canonicalPath)) {
    throw new Error(`lodSiblingPath expects a .glb path, got: ${canonicalPath}`);
  }
  return canonicalPath.replace(/\.glb$/i, `_lod${lod}.glb`);
}

/** Unique Object3D roots for a registry entry (aliases collapsed). */
export function propLodRoots(asset: PropLodAsset): import('three').Object3D[] {
  const roots = [asset.lod0];
  if (asset.lod1 !== asset.lod0) roots.push(asset.lod1);
  if (asset.lod2 !== asset.lod0 && asset.lod2 !== asset.lod1) roots.push(asset.lod2);
  return roots;
}

/** One GLTF load per unique lod0 path, with all registry registrations for that file. */
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
