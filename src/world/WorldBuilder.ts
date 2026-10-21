// src/world/WorldBuilder.ts — terrain, map props, orbs from authored map
import type { DirectionalLight, InstancedMesh, Scene, Texture } from 'three';
import type { AssetRegistry } from '../assets/assetManifest';
import { VILLAGE } from '../config/village';
import { initOrbSystem, type OrbSystemContext } from '../entities/energyOrb';
import {
  type GuideLineSystemContext,
  initGuideLineSystem,
} from '../entities/guideLine/GuideLineSystem';
import { withLandmarkStandIns } from '../landmarks/landmarkStandIns';
import { mapFileToGrids } from '../map/MapIO';
import type { LandmarkEntity, MapFile, ShrineEntity, VillageSeedEntity } from '../map/MapTypes';
import { resolveMapWaterLevelM } from '../map/mapWater';
import { bindWorldShadowVisibilityHeight } from '../rendering/sunShadow';
import type { GrassSystem } from './grass/core/GrassSystem';
import type { WorldTerrain } from './MapTerrainBuilder';
import { buildMapTerrain } from './MapTerrainBuilder';
import { collectVillageSeeds, spawnMapEntities } from './map/MapEntitySpawner';
import { initPropGroundContact } from './mapProps/config/propGroundContactUniforms';
import { bindPropContactAoRebake } from './mapProps/data/propContactAoDevState';
import { bakePropContactAoIntoTexture } from './mapProps/data/propContactAoTexture';
import type { PropLodGroup } from './mapProps/mapPropLod';
import type { TerrainTextureSet } from './terrain';
import { resolveSeed } from './village/VillageSystem';
import { WORLD } from './WorldConfig';

export interface BuildWorldOptions {
  map: MapFile;
}

export interface WorldContext {
  terrain: WorldTerrain;
  mapId: string;
  /** Map-authored prop InstancedMeshes (render debug / shadow diagnostics). */
  debugInstancedMeshes: InstancedMesh[];
  /** Distance-banded prop LOD groups (updated each frame from gameTick). */
  propLodGroups: PropLodGroup[];
  /** Authored village founding spots (the village system uses the first). */
  villageSeeds: VillageSeedEntity[];
  /** Authored shrines: zones where energy regenerates. */
  shrines: ShrineEntity[];
  /** Authored landmarks (Phase 0): one per kind at most. */
  landmarks: LandmarkEntity[];
  orbSystem: OrbSystemContext;
  guideLine: GuideLineSystemContext;
  disposeMapEntities: () => void;
  grassSystem?: GrassSystem;
}

export async function buildWorld(
  scene: Scene,
  assets: AssetRegistry,
  terrainTextures: TerrainTextureSet,
  sun: DirectionalLight,
  waterNormals: Texture,
  options: BuildWorldOptions,
): Promise<WorldContext> {
  const { map } = options;
  // The village levels its building pads into a 2 m detail layer around its seed.
  const seed = resolveSeed(collectVillageSeeds(map.entities ?? []));

  const terrain = buildMapTerrain(scene, terrainTextures, sun, mapFileToGrids(map), {
    waterNormals,
    waterLevelM: resolveMapWaterLevelM(map.water),
    auxMeta: map.terrainAuxMeta,
    // Play heights are static — bake Y onto the visible mesh so it can cast shadows.
    vertexDisplacement: false,
    fineRegion: seed ? { cx: seed.x, cz: seed.z, halfM: VILLAGE.PLINTH.REGION_HALF_M } : undefined,
  });

  initPropGroundContact({
    heightMap: terrain.heightMap,
    worldSize: WORLD.SIZE,
    heightScale: WORLD.HEIGHT_SCALE,
  });
  bindWorldShadowVisibilityHeight(terrain.heightMap, terrain.waterLevelM);

  bakePropContactAoIntoTexture(
    terrain.propAoMap,
    terrain,
    withLandmarkStandIns(map.entities ?? []),
    assets,
  );
  if (import.meta.env.DEV) {
    bindPropContactAoRebake(() => {
      bakePropContactAoIntoTexture(
        terrain.propAoMap,
        terrain,
        withLandmarkStandIns(map.entities ?? []),
        assets,
      );
    });
  }

  const spawned = spawnMapEntities(scene, sun, assets, terrain, map);

  const orbSystem = initOrbSystem(scene, terrain, {
    placements: spawned.orbPlacements,
  });
  const guideLine = initGuideLineSystem({
    scene,
    terrain,
    orbs: orbSystem.orbs,
  });

  return {
    terrain,
    mapId: map.id,
    debugInstancedMeshes: spawned.debugInstancedMeshes,
    propLodGroups: spawned.propLodGroups,
    villageSeeds: spawned.villageSeeds,
    shrines: spawned.shrines,
    landmarks: spawned.landmarks,
    orbSystem,
    guideLine,
    disposeMapEntities: () => spawned.dispose(),
  };
}
