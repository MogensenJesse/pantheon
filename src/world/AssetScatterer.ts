// src/world/AssetScatterer.ts — orchestrates prop + grass instanced scatter

import alea from 'alea';
import type { BufferGeometry, InstancedMesh, Material, Scene } from 'three';
import {
  type AssetRegistry,
  GRASS_ACCENT_VARIANTS,
  GRASS_COVER_VARIANTS,
  GRASS_GLB_KEY,
} from '../assets/assetManifest';
import { devSettings } from '../core/GameState';
import { initGrassMaterial } from './grass/grassMaterial';
import { countResolvedGrassMeshes, extractGrassDiffuseMap } from './grass/grassPrototype';
import {
  disposeGrassGroup,
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

export interface BuildAssetScattererOptions {
  /** When false, only grass is scattered (authored maps). Default true. */
  scatterProps?: boolean;
  /** When false, skip grass instancing. Default true. */
  scatterGrass?: boolean;
  /** Multiplier on grass placement counts (authored maps). */
  grassDensityMul?: number;
}

export type { InstancedGroup } from './scatter/placementTypes';

export interface ScatterShadowStats {
  grassGroups: number;
  propGroups: number;
  propCastShadowGroups: number;
}

export interface AssetScatterer {
  getDebugMeshes: () => InstancedMesh[];
  getShadowScatterStats: () => ScatterShadowStats;
  dispose: () => void;
  rebuildGrass: () => void;
  updateGrassCull: (playerX: number, playerZ: number) => void;
}

export function buildAssetScatterer(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainSurface,
  options: BuildAssetScattererOptions = {},
): AssetScatterer {
  const { scatterProps = true, scatterGrass = true, grassDensityMul = 1 } = options;
  const rng = alea(`${WORLD.SEED}-scatter`);
  const grassRng = alea(`${WORLD.SEED}-grass`);
  const groups: InstancedGroup[] = [];
  const grassGeometryCache = new Map<string, BufferGeometry>();

  const grassRoot = assets.get(GRASS_GLB_KEY);
  if (grassRoot) {
    const diffuse = extractGrassDiffuseMap(grassRoot, GRASS_COVER_VARIANTS[0].meshName);
    initGrassMaterial(diffuse);
    const names = [
      ...GRASS_COVER_VARIANTS.map((v) => v.meshName),
      ...GRASS_ACCENT_VARIANTS.map((v) => v.meshName),
    ];
    const resolved = countResolvedGrassMeshes(assets, GRASS_GLB_KEY, names);
    if (import.meta.env.DEV) {
      console.info(`[grass] GLB prototypes resolved: ${resolved}/${names.length}`);
    }
  } else if (import.meta.env.DEV) {
    console.warn('[grass] GLB not loaded — grass scatter skipped');
  }

  if (grassRoot && scatterGrass) {
    scatterGrassIntoScene(
      scene,
      assets,
      terrain,
      groups,
      grassGeometryCache,
      grassRng,
      grassDensityMul,
    );
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
  };

  const rebuildGrass = () => {
    if (!grassRoot) return;
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
      grassDensityMul,
    );
  };

  const updateGrassCull = (playerX: number, playerZ: number) => {
    updateGrassDistanceCull(groups, playerX, playerZ);
  };

  const getDebugMeshes = () => groups.map((g) => g.mesh);

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

  return { getDebugMeshes, getShadowScatterStats, dispose, rebuildGrass, updateGrassCull };
}
