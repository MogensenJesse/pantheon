// src/world/AssetScatterer.ts — orchestrates prop + grass instanced scatter

import alea from 'alea';
import type { BufferGeometry, InstancedMesh, Material, Scene } from 'three';
import { FOLIAGE_PACKS, type AssetRegistry } from '../assets/assetManifest';
import { devSettings } from '../core/GameState';
import {
  disposeFoliageMaterials,
  initFoliageMaterial,
} from './grass/grassMaterial';
import {
  countResolvedGrassMeshes,
  prepareGrassTextures,
} from './grass/grassPrototype';
import {
  computeGrassPerfStats,
  disposeGrassGroup,
  type GrassPerfStats,
  scatterGrassIntoScene,
  updateGrassDistanceCull,
} from './grass/grassScatter';
import { scatter } from './scatter/placementEngine';
import type { InstancedGroup } from './scatter/placementTypes';
import { buildInstancedMeshes } from './scatter/propInstancing';
import {
  buildPropScatterConfigs,
  PROP_ROCK_KEYS,
  PROP_TREE_KEYS,
} from './scatter/propScatterConfigs';
import type { TerrainSurface } from './TerrainGenerator';
import { WORLD } from './WorldConfig';
import type { FoliagePackKey } from './grass/foliageTypes';

export interface BuildAssetScattererOptions {
  /** When false, only grass is scattered (authored maps). Default true. */
  scatterProps?: boolean;
  /** When false, skip grass instancing. Default true. */
  scatterGrass?: boolean;
}

export type { InstancedGroup } from './scatter/placementTypes';

export interface ScatterShadowStats {
  grassGroups: number;
  propGroups: number;
  propCastShadowGroups: number;
}

export type { GrassPerfStats } from './grass/grassScatter';

export interface AssetScatterer {
  getDebugMeshes: () => InstancedMesh[];
  getShadowScatterStats: () => ScatterShadowStats;
  getGrassPerfStats: () => GrassPerfStats;
  dispose: () => void;
  rebuildGrass: () => void;
  updateGrassCull: (playerX: number, playerZ: number, cameraX: number, cameraZ: number) => void;
}

async function initAllFoliageMaterials(assets: AssetRegistry): Promise<boolean> {
  let anyLoaded = false;
  for (const packKey of Object.keys(FOLIAGE_PACKS) as FoliagePackKey[]) {
    const pack = FOLIAGE_PACKS[packKey];
    const root = assets.get(pack.registryKey);
    if (!root) continue;
    const maps = await prepareGrassTextures(packKey, root);
    initFoliageMaterial(packKey, maps);
    const meshNames = pack.variants.map((v) => v.meshName);
    const resolved = countResolvedGrassMeshes(assets, packKey, meshNames);
    if (import.meta.env.DEV) {
      console.info(`[foliage] ${packKey} prototypes resolved: ${resolved}/${meshNames.length}`);
    }
    anyLoaded = true;
  }
  return anyLoaded;
}

export async function buildAssetScatterer(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainSurface,
  options: BuildAssetScattererOptions = {},
): Promise<AssetScatterer> {
  const { scatterProps = true, scatterGrass = true } = options;
  const rng = alea(`${WORLD.SEED}-scatter`);
  const grassRng = alea(`${WORLD.SEED}-grass`);
  const groups: InstancedGroup[] = [];
  const grassGeometryCache = new Map<string, BufferGeometry>();

  const foliageReady = await initAllFoliageMaterials(assets);
  if (!foliageReady && import.meta.env.DEV) {
    console.warn('[foliage] no glTF packs loaded — foliage scatter skipped');
  }

  if (foliageReady && scatterGrass) {
    scatterGrassIntoScene(scene, assets, terrain, groups, grassGeometryCache, grassRng);
  }

  if (scatterProps)
    for (const config of buildPropScatterConfigs()) {
      const scattered = scatter(config, terrain, rng, config.entries);
      for (const { entry, placements } of scattered) {
        if (placements.length === 0) continue;
        const model = assets.get(entry.key);
        if (!model) {
          console.warn(`Missing scatter asset: ${entry.key}`);
          continue;
        }
        const meshes = buildInstancedMeshes(model, placements, terrain, config.surfaceLift ?? 0);
        const castsShadow = PROP_TREE_KEYS.has(entry.key) || PROP_ROCK_KEYS.has(entry.key);
        for (const mesh of meshes) {
          if (castsShadow) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
          scene.add(mesh);
          groups.push({ mesh, placements, surfaceLift: config.surfaceLift ?? 0 });
        }
      }
    }

  const disposeGroup = (group: InstancedGroup, disposeGrassGeometry: boolean) => {
    if (group.isGrass) {
      disposeGrassGroup(scene, group, disposeGrassGeometry);
      return;
    }
    scene.remove(group.mesh);
    group.mesh.geometry.dispose();
    const mats = Array.isArray(group.mesh.material) ? group.mesh.material : [group.mesh.material];
    for (const m of mats) {
      const depth = (m as Material & { customDepthMaterial?: Material }).customDepthMaterial;
      depth?.dispose();
      m.dispose();
    }
  };

  const dispose = () => {
    for (const group of groups) disposeGroup(group, true);
    for (const geo of grassGeometryCache.values()) geo.dispose();
    grassGeometryCache.clear();
    groups.length = 0;
    disposeFoliageMaterials();
  };

  const rebuildGrass = () => {
    if (!foliageReady) return;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].isGrass) {
        disposeGroup(groups[i], false);
        groups.splice(i, 1);
      }
    }
    devSettings.grass.dirty = false;
    scatterGrassIntoScene(
      scene,
      assets,
      terrain,
      groups,
      grassGeometryCache,
      alea(`${WORLD.SEED}-grass-rebuild`),
    );
  };

  const updateGrassCull = (playerX: number, playerZ: number, cameraX: number, cameraZ: number) => {
    updateGrassDistanceCull(groups, playerX, playerZ, cameraX, cameraZ);
  };

  const getDebugMeshes = () => groups.map((g) => g.mesh);

  const getGrassPerfStats = () => computeGrassPerfStats(groups);

  const getShadowScatterStats = (): ScatterShadowStats => {
    let grassGroups = 0;
    let propGroups = 0;
    let propCastShadowGroups = 0;
    for (const g of groups) {
      if (g.isGrass) {
        grassGroups++;
        continue;
      }
      propGroups++;
      if (g.mesh.castShadow) propCastShadowGroups++;
    }
    return { grassGroups, propGroups, propCastShadowGroups };
  };

  return {
    getDebugMeshes,
    getShadowScatterStats,
    getGrassPerfStats,
    dispose,
    rebuildGrass,
    updateGrassCull,
  };
}
