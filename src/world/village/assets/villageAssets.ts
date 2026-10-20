// src/world/village/assets/villageAssets.ts — the village kit as a prop-asset registry (modelled GLBs over placeholder geometry)
import {
  type BufferGeometry,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three';
import type { PropLodAsset } from '../../../assets/assetManifest';
import {
  FENCE_KEY,
  GRAVE_KEY,
  glowKey,
  STOCKPILE_KEY,
  STUMP_KEY,
  stageKey,
  type VillageAssetMeta,
  type VillageBuildingType,
  type VillageStage,
} from '../model/assetKeys';
import { buildHouseKit, HOUSE_TYPES } from './placeholder/buildingKit';
import {
  buildFenceGeometry,
  buildGraveGeometry,
  buildStockpileGeometry,
  buildStumpGeometry,
} from './placeholder/dressingKit';
import { alias, type LodGeometries } from './placeholder/kitUtil';
import { buildTempleKit, buildWellKit } from './placeholder/temple';
import type { VillageKit } from './villageKit';

export interface VillageAssetSet {
  /** Asset key to lod0/lod1/lod2 scenes, in the registry shape map props use. */
  assets: Map<string, PropLodAsset>;
  meta: Map<VillageBuildingType, VillageAssetMeta>;
  /** Modelled villager figures (villagers.glb), or null for the placeholders. */
  villagers: Object3D | null;
  dispose: () => void;
}

/** Placeholder kit (one vertex-coloured mesh per LOD), with any modelled `kit` assets and metadata on top. */
export function createVillageAssets(kit?: VillageKit): VillageAssetSet {
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
    register(glowKey(type), alias(geometry), glowMaterial);

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

  register(FENCE_KEY, buildFenceGeometry());
  register(STOCKPILE_KEY, buildStockpileGeometry());
  register(GRAVE_KEY, buildGraveGeometry());
  register(STUMP_KEY, buildStumpGeometry());

  const kitMaterials = new Set<Material>();
  for (const [key, asset] of kit?.assets ?? []) {
    assets.set(key, asset);
    for (const root of new Set([asset.lod0, asset.lod1, asset.lod2])) {
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          kitMaterials.add(m);
      });
    }
  }
  for (const [type, m] of kit?.meta ?? []) meta.set(type, m);

  return {
    assets,
    meta,
    villagers: kit?.villagers ?? null,
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      for (const m of kitMaterials) {
        (m as MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
      vertexMaterial.dispose();
      glowMaterial.dispose();
      assets.clear();
      meta.clear();
    },
  };
}
