// src/world/village/assets/villageAssets.ts — the village kit as a prop-asset registry (placeholder geometry today)
import { type BufferGeometry, Group, type Material, Mesh, MeshStandardMaterial } from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import { buildHouseKit, HOUSE_TYPES, type LodGeometries } from './placeholder/buildingKit';
import {
  buildCropGeometry,
  buildFenceGeometry,
  buildPlinthGeometry,
  buildStepsGeometry,
  buildStockpileGeometry,
} from './placeholder/dressingKit';
import { buildTempleKit, buildWellKit } from './placeholder/temple';
import {
  CROP_KEYS,
  FENCE_KEY,
  glowKey,
  PLINTH_KEY,
  STEPS_KEY,
  STOCKPILE_KEY,
  stageKey,
  type VillageAssetMeta,
  type VillageBuildingType,
  type VillageStage,
} from './villageAssetKeys';

export interface VillageAssetSet {
  /** Asset key to lod0/lod1/lod2 scenes, in the registry shape map props use. */
  assets: Map<string, PropLodAsset>;
  meta: Map<VillageBuildingType, VillageAssetMeta>;
  dispose: () => void;
}

/** Placeholder kit: one vertex-coloured mesh per LOD. GLB overrides plug into the same registry shape. */
export function createVillageAssets(): VillageAssetSet {
  const vertexMaterial = new MeshStandardMaterial({ name: 'village_vertex', roughness: 1 });
  const glowMaterial = new MeshStandardMaterial({ name: 'village_window_glow' });
  const geometries = new Set<BufferGeometry>();
  const assets = new Map<string, PropLodAsset>();
  const meta = new Map<VillageBuildingType, VillageAssetMeta>();

  const lodRoot = (name: string, geometry: BufferGeometry, material: Material): Group => {
    geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    const root = new Group();
    root.name = name;
    root.add(mesh);
    return root;
  };
  const register = (key: string, lods: LodGeometries, material: Material = vertexMaterial) => {
    assets.set(key, {
      lod0: lodRoot(key, lods[0], material),
      lod1: lodRoot(key, lods[1], material),
      lod2: lodRoot(key, lods[2], material),
    });
  };
  const registerGlow = (type: VillageBuildingType, geometry: BufferGeometry) =>
    register(glowKey(type), [geometry, geometry, geometry], glowMaterial);

  for (const type of HOUSE_TYPES) {
    const kit = buildHouseKit(type);
    kit.stages.forEach((lods, stage) => {
      register(stageKey(type, stage as VillageStage), lods);
    });
    if (kit.glow) registerGlow(type, kit.glow);
    meta.set(type, kit.meta);
  }

  const temple = buildTempleKit();
  register(stageKey('temple', 2), temple.geometries);
  registerGlow('temple', temple.glow);
  meta.set('temple', temple.meta);

  const well = buildWellKit();
  register(stageKey('well', 2), well.geometries);
  meta.set('well', well.meta);

  register(PLINTH_KEY, buildPlinthGeometry());
  register(STEPS_KEY, buildStepsGeometry());
  register(FENCE_KEY, buildFenceGeometry());
  register(STOCKPILE_KEY, buildStockpileGeometry());
  CROP_KEYS.forEach((key, variant) => {
    register(key, buildCropGeometry(variant as 0 | 1));
  });

  return {
    assets,
    meta,
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      vertexMaterial.dispose();
      glowMaterial.dispose();
      assets.clear();
      meta.clear();
    },
  };
}
