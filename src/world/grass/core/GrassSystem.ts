// src/world/grass/GrassSystem.ts — player-follow biome grass (3 independent LOD rings)
import type { DirectionalLight, Group, PerspectiveCamera, Scene } from 'three';
import { Matrix4, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { MapGrassSettings } from '../../../map/MapTypes';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { WORLD } from '../../WorldConfig';
import { GRASS_INDIRECT_INSTANCE_COUNT_OFFSET } from '../compute/grassSsbo';
import { GRASS_RING_COUNT } from '../config/grassConfig';
import { createGrassSunShadow, grassSharedUniforms } from '../config/grassUniforms';
import { applyMapGrassSettings } from '../data/applyMapGrassSettings';
import {
  createGrassDataTexture,
  estimateGrassVisibilityFraction,
  grassDataDensitiesFromUniforms,
  updateGrassDataTexture,
} from '../data/grassDataTexture';
import { loadFlowerSprite } from '../data/loadFlowerSprite';
import { loadGrassWindAtlas } from '../data/loadGrassWindAtlas';
import { createGrassComputeQueue } from './grassComputeQueue';
import { createGrassFieldManager } from './grassFieldManager';

export interface GrassUpdateParams {
  playerPosition: Vector3;
  playerRadius: number;
  camera: PerspectiveCamera;
  elapsed: number;
  sunIntensity: number;
  daylight: number;
  playerLightDistance: number;
  playerLightIntensity: number;
}

export interface GrassSystemInitOptions {
  sun: DirectionalLight;
  mapGrass?: MapGrassSettings;
  onMeshReplaced?: (root: Group) => void;
}

export interface GrassBladeStats {
  allocatedTotal: number;
  rings: Array<{
    ringIndex: number;
    instanceCount: number;
    bladesPerSide: number;
    compactedVisible: number;
  }>;
  biomeGrassThreshold: number;
  biomeGrassFadeWidth: number;
  /** Map-weighted expected visible fraction after stochastic biome cull. */
  estimatedVisibleFraction: number;
  estimatedVisibleTotal: number;
  /** Last GPU compact pass draw count (sum of mesh.count across rings). */
  compactedVisibleTotal: number;
}

export interface GrassSystem {
  mesh: Group;
  update: (params: GrassUpdateParams) => void;
  /** Await before drawing grass/flowers so GPU compaction finishes first. */
  whenComputeReady: () => Promise<void>;
  reinitInstances: () => Promise<void>;
  rebuildField: () => Promise<void>;
  rebuildRing: (ringIndex: number) => Promise<void>;
  onTerrainMapsUpdated: () => void;
  refreshGrassDataMap: () => void;
  getBladeStats: () => GrassBladeStats;
  syncBladeStatsFromGpu: () => Promise<void>;
  dispose: () => void;
}

const _prevPlayer = new Vector3();
const _cameraMatrix = new Matrix4();
const _cameraForward = new Vector3();

export async function initGrassSystem(
  scene: Scene,
  renderer: WebGPURenderer,
  terrain: MapTerrainContext,
  options: GrassSystemInitOptions,
): Promise<GrassSystem> {
  const sunShadow = createGrassSunShadow(options.sun);
  grassSharedUniforms.uWorldSize.value = WORLD.SIZE;
  grassSharedUniforms.uHeightScale.value = WORLD.HEIGHT_SCALE;
  const mapGrassUniforms = applyMapGrassSettings(options?.mapGrass);
  const grassDataDensities = () =>
    grassDataDensitiesFromUniforms(
      mapGrassUniforms,
      grassSharedUniforms.uBiomeGrassThreshold.value,
    );
  const grassDataMap = createGrassDataTexture(terrain.grids, grassDataDensities());
  const windAtlas = await loadGrassWindAtlas();
  const flowerSprite = await loadFlowerSprite();

  const fieldManager = createGrassFieldManager(
    scene,
    { grassDataMap, windAtlas, flowerSprite, sunShadow },
    options.onMeshReplaced,
  );

  let compactedVisibleTotal = 0;
  let compactedPerRing: number[] = fieldManager.state.ringFields.map(() => 0);

  const syncBladeStatsFromGpu = async () => {
    if (!import.meta.env.DEV) return;
    let total = 0;
    const perRing: number[] = [];
    for (const field of fieldManager.state.ringFields) {
      const buffer = await renderer.getArrayBufferAsync(
        field.ssbo.indirectBuffer,
        null,
        GRASS_INDIRECT_INSTANCE_COUNT_OFFSET,
        4,
      );
      const count = new Uint32Array(buffer)[0] ?? 0;
      perRing.push(count);
      total += count;
    }
    compactedVisibleTotal = total;
    compactedPerRing = perRing;
  };

  await fieldManager.bootComputeAll(
    renderer,
    fieldManager.state.ringFields,
    fieldManager.state.flowerField,
  );
  if (import.meta.env.DEV) await syncBladeStatsFromGpu();

  _prevPlayer.copy(grassSharedUniforms.uPlayerPosition.value);

  let compileCamera: PerspectiveCamera | null = null;

  const computeQueue = createGrassComputeQueue(
    renderer,
    () => fieldManager.state.ringFields.map((f) => f.ssbo),
    () => fieldManager.state.flowerField?.ssbo ?? null,
  );

  const compileGrass = async () => {
    if (!compileCamera) return;
    await renderer.compileAsync(scene, compileCamera);
  };

  const refreshGrassDataMap = () => {
    mapGrassUniforms.meadowDensity = grassSharedUniforms.uMeadowDensity.value;
    mapGrassUniforms.forestDensity = grassSharedUniforms.uForestDensity.value;
    mapGrassUniforms.hillsDensity = grassSharedUniforms.uHillsDensity.value;
    mapGrassUniforms.shoreDensity = grassSharedUniforms.uShoreDensity.value;
    mapGrassUniforms.mountainDensity = grassSharedUniforms.uMountainDensity.value;
    mapGrassUniforms.pathDensity = grassSharedUniforms.uPathDensity.value;
    updateGrassDataTexture(grassDataMap, terrain.grids, grassDataDensities());
  };

  return {
    get mesh() {
      return fieldManager.state.fieldGroup.root;
    },

    whenComputeReady: computeQueue.whenComputeReady,

    reinitInstances: () =>
      computeQueue.enqueueBlockingGrassTask(async () => {
        await fieldManager.reinitAllInstances(renderer);
        if (import.meta.env.DEV) await syncBladeStatsFromGpu();
        computeQueue.setFieldReady(true);
      }),

    rebuildField: () =>
      computeQueue.enqueueBlockingGrassTask(async () => {
        refreshGrassDataMap();
        await fieldManager.rebuildAllRings(renderer);
        computeQueue.setFieldReady(true);
        await compileGrass();
      }),

    rebuildRing: (ringIndex: number) =>
      computeQueue.enqueueBlockingGrassTask(async () => {
        if (ringIndex < 0 || ringIndex >= GRASS_RING_COUNT) return;
        refreshGrassDataMap();
        await fieldManager.rebuildSingleRing(renderer, ringIndex);
        computeQueue.setFieldReady(true);
        await compileGrass();
      }),

    update(params) {
      const {
        playerPosition,
        playerRadius,
        camera,
        elapsed,
        sunIntensity,
        daylight,
        playerLightDistance,
        playerLightIntensity,
      } = params;
      compileCamera = camera;

      grassSharedUniforms.uPlayerDeltaXZ.value.set(
        playerPosition.x - _prevPlayer.x,
        playerPosition.z - _prevPlayer.z,
      );
      grassSharedUniforms.uPlayerPosition.value.copy(playerPosition);
      grassSharedUniforms.uPlayerRadius.value = playerRadius;
      grassSharedUniforms.uTime.value = elapsed;
      grassSharedUniforms.uSunIntensity.value = sunIntensity;
      grassSharedUniforms.uDaylight.value = daylight;
      grassSharedUniforms.uLightRadius.value = playerLightDistance;
      grassSharedUniforms.uLightIntensity.value = playerLightIntensity;

      camera.updateMatrixWorld();
      _cameraMatrix.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      grassSharedUniforms.uCameraMatrix.value.copy(_cameraMatrix);
      const pe = camera.projectionMatrix.elements;
      grassSharedUniforms.uFx.value = pe[0];
      grassSharedUniforms.uFy.value = pe[5];
      camera.getWorldDirection(_cameraForward);
      grassSharedUniforms.uCameraForward.value.copy(_cameraForward);

      if (fieldManager.state.fieldGroup.root.visible && computeQueue.isFieldReady()) {
        computeQueue.requestCompute();
      }

      fieldManager.setWorldPosition(playerPosition.x, playerPosition.z);
      _prevPlayer.copy(playerPosition);
    },

    onTerrainMapsUpdated() {
      refreshGrassDataMap();
      terrain.applyHeightsToMesh();
      computeQueue.requestCompute();
    },

    refreshGrassDataMap,

    getBladeStats(): GrassBladeStats {
      const threshold = grassSharedUniforms.uBiomeGrassThreshold.value;
      const fadeWidth = grassSharedUniforms.uBiomeGrassFadeWidth.value;
      const data = grassDataMap.image.data as Uint8Array;
      const estimatedVisibleFraction = estimateGrassVisibilityFraction(data, threshold, fadeWidth);
      const rings = fieldManager.state.ringFields.map((field, ringIndex) => ({
        ringIndex,
        instanceCount: field.layout.instanceCount,
        bladesPerSide: field.layout.bladesPerSide,
        compactedVisible: compactedPerRing[ringIndex] ?? 0,
      }));
      const allocatedTotal = rings.reduce((sum, r) => sum + r.instanceCount, 0);
      return {
        allocatedTotal,
        rings,
        biomeGrassThreshold: threshold,
        biomeGrassFadeWidth: fadeWidth,
        estimatedVisibleFraction,
        estimatedVisibleTotal: Math.round(allocatedTotal * estimatedVisibleFraction),
        compactedVisibleTotal:
          compactedVisibleTotal || rings.reduce((sum, r) => sum + r.compactedVisible, 0),
      };
    },

    syncBladeStatsFromGpu,

    dispose() {
      computeQueue.setFieldReady(false);
      fieldManager.dispose();
      grassDataMap.dispose();
      windAtlas?.dispose();
      flowerSprite?.dispose();
    },
  };
}
