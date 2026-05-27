// src/world/grass/grassScatter.ts — orchestrator: placement + instancing + distance cull
//
// Public API kept identical for AssetScatterer callers:
//   scatterGrassIntoScene(...)
//   updateGrassDistanceCull(...)
//   disposeGrassGroup(...) — re-exported from grassInstancing.
import { BufferGeometry, Scene } from 'three';
import {
  GRASS_GLB_KEY,
  type AssetRegistry,
} from '../../assets/assetManifest';
import { PHASE0 } from '../../config/phase0';
import { distributePlacements } from '../scatter/placementEngine';
import type { InstancedGroup } from '../scatter/placementTypes';
import type { TerrainContext } from '../TerrainGenerator';
import {
  GRASS_BIOME_BANDS,
} from './grassBiomeDensity';
import { getGrassPrototype } from './grassPrototype';
import {
  bucketPlacementsByCell,
  grassScatterConfigs,
  scatterGrassPlacements,
} from './grassPlacement';
import {
  buildGrassInstancedMeshes,
  disposeGrassGroup,
} from './grassInstancing';

export { disposeGrassGroup };

export function scatterGrassIntoScene(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
  groups: InstancedGroup[],
  geometryCache: Map<string, BufferGeometry>,
  rng: () => number,
): void {
  const grassConfigs = grassScatterConfigs();
  const surfaceLift = PHASE0.GRASS.SURFACE_LIFT;
  let totalInstances = 0;
  let meshGroups = 0;

  for (const config of grassConfigs) {
    const globalPlacements = scatterGrassPlacements(config, terrain, rng);
    const label = config.entries[0]?.class ?? 'grass';
    const targetTotal = Math.round(
      config.count * GRASS_BIOME_BANDS.reduce((s, b) => s + b.countShare, 0),
    );
    if (import.meta.env.DEV) {
      console.info(
        `[grass] ${label}: ${globalPlacements.length} placements (budget ~${targetTotal} from ${config.count} base)`,
      );
    }
    const scattered = distributePlacements(globalPlacements, config.entries, rng);
    const cellSize = PHASE0.GRASS.CULL_CELL_SIZE;
    for (const { entry, placements } of scattered) {
      if (placements.length === 0) continue;
      try {
        const prototype = getGrassPrototype(assets, GRASS_GLB_KEY, entry.meshName);
        const buckets = bucketPlacementsByCell(placements, cellSize);
        for (const bucket of buckets) {
          const meshes = buildGrassInstancedMeshes(
            prototype,
            entry.meshName,
            bucket.placements,
            terrain,
            config.surfaceLift ?? surfaceLift,
            geometryCache,
          );
          for (const mesh of meshes) {
            scene.add(mesh);
            groups.push({
              mesh,
              placements: bucket.placements,
              surfaceLift: config.surfaceLift ?? surfaceLift,
              isGrass: true,
              cullCenterX: bucket.centerX,
              cullCenterZ: bucket.centerZ,
            });
            totalInstances += bucket.placements.length;
            meshGroups += 1;
          }
        }
      } catch (err) {
        console.warn(`[grass] skip ${entry.meshName}:`, err);
      }
    }
  }

  if (import.meta.env.DEV) {
    console.info(`[grass] scatter complete: ${meshGroups} instanced meshes, ${totalInstances} instances`);
  }
}

export function updateGrassDistanceCull(
  groups: InstancedGroup[],
  playerX: number,
  playerZ: number,
): void {
  const cutSq = PHASE0.GRASS.DISTANCE_CUT * PHASE0.GRASS.DISTANCE_CUT;
  for (const group of groups) {
    if (!group.isGrass || group.cullCenterX === undefined || group.cullCenterZ === undefined) continue;
    const dx = group.cullCenterX - playerX;
    const dz = group.cullCenterZ - playerZ;
    group.mesh.visible = dx * dx + dz * dz <= cutSq;
  }
}
