// src/world/grass/grassScatter.ts — orchestrator: placement + instancing + distance cull
import type { BufferGeometry, Scene } from 'three';
import type { AssetRegistry } from '../../assets/assetManifest';
import { PHASE0 } from '../../config/phase0';
import { FOLIAGE_SCATTER_BIOME_KEYS, getFoliageBiomeRules } from './foliageBiomeRules';
import type { FoliagePlacement } from './foliageTypes';
import { buildGrassInstancedMeshes, disposeGrassGroup } from './grassInstancing';
import {
  bucketPlacementsByCell,
  grassScatterConfigs,
  scatterFoliagePlacements,
} from './grassPlacement';
import { getGrassPrototype } from './grassPrototype';

export { disposeGrassGroup };

export interface GrassPerfStats {
  meshGroups: number;
  totalInstances: number;
  visibleDrawCalls: number;
  visibleInstances: number;
}

export function computeGrassPerfStats(groups: import('../scatter/placementTypes').InstancedGroup[]): GrassPerfStats {
  let meshGroups = 0;
  let totalInstances = 0;
  let visibleDrawCalls = 0;
  let visibleInstances = 0;

  for (const group of groups) {
    if (!group.isGrass) continue;
    meshGroups += 1;
    const n = group.placements.length;
    totalInstances += n;
    if (group.mesh.visible) {
      visibleInstances += n;
      visibleDrawCalls += 1;
    }
  }

  return { meshGroups, totalInstances, visibleDrawCalls, visibleInstances };
}

function groupPlacementsByVariant(
  placements: FoliagePlacement[],
): Map<string, { packKey: FoliagePlacement['packKey']; meshName: string; placements: FoliagePlacement[] }> {
  const byKey = new Map<
    string,
    { packKey: FoliagePlacement['packKey']; meshName: string; placements: FoliagePlacement[] }
  >();
  for (const p of placements) {
    const key = `${p.packKey}|${p.meshName}`;
    let group = byKey.get(key);
    if (!group) {
      group = { packKey: p.packKey, meshName: p.meshName, placements: [] };
      byKey.set(key, group);
    }
    p.instanceIndex = group.placements.length;
    group.placements.push(p);
  }
  return byKey;
}

export function scatterGrassIntoScene(
  scene: Scene,
  assets: AssetRegistry,
  terrain: import('../TerrainGenerator').TerrainContext,
  groups: import('../scatter/placementTypes').InstancedGroup[],
  geometryCache: Map<string, BufferGeometry>,
  rng: () => number,
): void {
  const foliageConfigs = grassScatterConfigs();
  const surfaceLift = PHASE0.GRASS.SURFACE_LIFT;
  const rules = getFoliageBiomeRules();
  const shareSum = FOLIAGE_SCATTER_BIOME_KEYS.reduce((s, k) => s + rules[k].countShare, 0);
  let totalInstances = 0;
  let meshGroups = 0;

  for (const config of foliageConfigs) {
    const globalPlacements = scatterFoliagePlacements(config, terrain, rng);
    const targetTotal = Math.round(config.count * shareSum);
    if (import.meta.env.DEV) {
      console.info(
        `[foliage] ${config.foliageClass}: ${globalPlacements.length} placements (budget ~${targetTotal} from ${config.count} base)`,
      );
    }

    const byVariant = groupPlacementsByVariant(globalPlacements);
    const cellSize = PHASE0.GRASS.CULL_CELL_SIZE;

    for (const { packKey, meshName, placements } of byVariant.values()) {
      if (placements.length === 0) continue;
      if (!assets.get(packKey)) continue;
      try {
        const prototype = getGrassPrototype(assets, packKey, meshName);
        const buckets = bucketPlacementsByCell(placements, cellSize);
        for (const bucket of buckets) {
          const lift = config.surfaceLift ?? surfaceLift;
          const meshes = buildGrassInstancedMeshes(
            prototype,
            packKey,
            meshName,
            bucket.placements,
            terrain,
            lift,
            geometryCache,
          );
          const mesh = meshes[0];
          scene.add(mesh);

          groups.push({
            mesh,
            placements: bucket.placements,
            surfaceLift: lift,
            isGrass: true,
            foliagePackKey: packKey,
            cullCenterX: bucket.centerX,
            cullCenterZ: bucket.centerZ,
          });
          totalInstances += bucket.placements.length;
          meshGroups += 1;
        }
      } catch (err) {
        console.warn(`[foliage] skip ${packKey}/${meshName}:`, err);
      }
    }
  }

  if (import.meta.env.DEV) {
    console.info(
      `[foliage] scatter complete: ${meshGroups} instanced meshes, ${totalInstances} instances`,
    );
  }
}

export function updateGrassDistanceCull(
  groups: import('../scatter/placementTypes').InstancedGroup[],
  playerX: number,
  playerZ: number,
  _cameraX: number,
  _cameraZ: number,
): void {
  const { DISTANCE_CUT_SHOW, DISTANCE_CUT_HIDE } = PHASE0.GRASS;
  const showSq = DISTANCE_CUT_SHOW * DISTANCE_CUT_SHOW;
  const hideSq = DISTANCE_CUT_HIDE * DISTANCE_CUT_HIDE;

  for (const group of groups) {
    if (!group.isGrass || group.cullCenterX === undefined || group.cullCenterZ === undefined)
      continue;

    const cx = group.cullCenterX;
    const cz = group.cullCenterZ;
    const pdx = cx - playerX;
    const pdz = cz - playerZ;
    const playerDistSq = pdx * pdx + pdz * pdz;

    const wasVisible = group.mesh.visible;
    const inRange = wasVisible ? playerDistSq <= hideSq : playerDistSq <= showSq;
    const instanceCount = group.placements.length;

    if (!inRange) {
      group.mesh.visible = false;
      group.mesh.count = 0;
      continue;
    }

    group.mesh.visible = true;
    group.mesh.count = instanceCount;
  }
}
