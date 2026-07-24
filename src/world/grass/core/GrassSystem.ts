// src/world/grass/core/GrassSystem.ts — player-follow biome grass (3 independent LOD rings)
import type { DirectionalLight, Group, PerspectiveCamera, Scene } from 'three';
import { Matrix4, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { AssetRegistry } from '../../../assets/assetManifest';
import { runtimeSettings } from '../../../core/GameState';
import type { MapEntity, MapGrassSettings } from '../../../map/MapTypes';
import { createReceiverSunShadowNode } from '../../../rendering/sunShadow';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { createTerrainSurfaceHeightTsl } from '../../terrain/tsl/terrainSurfaceHeightTsl';
import { WORLD } from '../../WorldConfig';
import { FLOWER_INDIRECT_INSTANCE_COUNT_OFFSET } from '../compute/flowerSsbo';
import { GRASS_INDIRECT_INSTANCE_COUNT_OFFSET } from '../compute/grassSsbo';
import {
  GRASS_CAMERA_ONLY_COMPACT_EVERY_N,
  GRASS_IDLE_RING_REFRESH_FRAMES,
  GRASS_MOVE_EPS_SQ,
  GRASS_RING_COUNT,
  GRASS_TRAIL_REFRESH_FRAMES,
} from '../config/grassConfig';
import { grassSharedUniforms } from '../config/grassUniforms';
import { applyMapGrassSettings } from '../data/applyMapGrassSettings';
import {
  createGrassDataTexture,
  estimateGrassVisibilityFraction,
  updateGrassDataTexture,
} from '../data/grassDataTexture';
import { loadFlowerSprite } from '../data/loadFlowerSprite';
import { loadGrassWindAtlas } from '../data/loadGrassWindAtlas';
import {
  createEmptyPropGrassExclusionTexture,
  createPropGrassExclusionTexture,
} from '../data/propGrassExclusionTexture';
import { createGrassComputeQueue } from './grassComputeQueue';
import { createGrassFieldManager } from './grassFieldManager';

export interface GrassUpdateParams {
  playerPosition: Vector3;
  playerRadius: number;
  camera: PerspectiveCamera;
  elapsed: number;
  daylight: number;
  playerLightDistance: number;
  playerLightIntensity: number;
}

export interface GrassSystemInitOptions {
  sun: DirectionalLight;
  mapGrass?: MapGrassSettings;
  mapEntities?: readonly MapEntity[];
  assets?: AssetRegistry;
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
  /** Await at rebuild/dispose boundaries — gameplay draws prev-frame indirect without per-frame sync. */
  whenComputeReady: () => Promise<void>;
  /** False while a blocking rebuild/reinit task holds the field. */
  isFieldReady: () => boolean;
  /** Force a compact pass (e.g. trail dev sliders while player is static). */
  requestCompactPass: () => void;
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
const _prevCameraMatrix = new Matrix4();
const _cameraForward = new Vector3();
const _skipRingIndices = new Set<number>();

export async function initGrassSystem(
  scene: Scene,
  renderer: WebGPURenderer,
  terrain: MapTerrainContext,
  options: GrassSystemInitOptions,
): Promise<GrassSystem> {
  const sunShadow = createReceiverSunShadowNode(options.sun);
  grassSharedUniforms.uWorldSize.value = WORLD.SIZE;
  grassSharedUniforms.uHeightScale.value = WORLD.HEIGHT_SCALE;
  const mapGrassUniforms = applyMapGrassSettings(options?.mapGrass);
  const terrainGrassMaps = {
    biomeMap: terrain.biomeMap,
    meadowMap: terrain.meadowMap,
    pathMap: terrain.pathMap,
  };
  const grassDataMap = createGrassDataTexture(terrain.grids, mapGrassUniforms, terrainGrassMaps);
  const propExclusionMap =
    options.mapEntities && options.assets
      ? createPropGrassExclusionTexture(terrain, options.mapEntities, options.assets)
      : createEmptyPropGrassExclusionTexture(terrain.grids.size);
  const windAtlas = await loadGrassWindAtlas();
  const flowerSprite = await loadFlowerSprite();

  const terrainSurfaceHeight =
    terrain.detailDisplacementMap !== null
      ? createTerrainSurfaceHeightTsl({
          uniforms: terrain.splatMaterial.terrainUniforms,
          detailDispAtlas: terrain.detailDisplacementMap,
          clipmapDetailFade: terrain.lodEnabled,
        })
      : null;

  const fieldManager = createGrassFieldManager(
    scene,
    { grassDataMap, propExclusionMap, windAtlas, flowerSprite, sunShadow, terrainSurfaceHeight },
    options.onMeshReplaced,
  );

  let compactedVisibleTotal = 0;
  let compactedPerRing: number[] = fieldManager.state.ringFields.map(() => 0);
  const lastCompactPerRing: number[] = fieldManager.state.ringFields.map(() => -1);
  let lastFlowerCompact = -1;
  let staticFrameCount = 0;
  /** Frames since last player/data move — used to cadence camera-only compact. */
  let cameraOnlyCompactFrame = 0;
  let grassDataDirty = false;
  let cameraMatrixInitialized = false;
  let sceneWasDynamic = false;
  /** At most one compact-count GPU readback in flight (avoids piled-up getArrayBufferAsync). */
  let readbackInFlight = false;

  let compileCamera: PerspectiveCamera | null = null;

  const readCompactCountsFromGpu = async () => {
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
    for (let i = 0; i < perRing.length; i++) {
      lastCompactPerRing[i] = perRing[i] ?? 0;
    }
    if (fieldManager.state.flowerField) {
      const buffer = await renderer.getArrayBufferAsync(
        fieldManager.state.flowerField.ssbo.indirectBuffer,
        null,
        FLOWER_INDIRECT_INSTANCE_COUNT_OFFSET,
        4,
      );
      lastFlowerCompact = new Uint32Array(buffer)[0] ?? 0;
    } else {
      lastFlowerCompact = 0;
    }
  };

  const computeQueue = createGrassComputeQueue(
    renderer,
    () => fieldManager.state.ringFields.map((f) => f.ssbo),
    () => fieldManager.state.flowerField?.ssbo ?? null,
  );

  const scheduleCompactCountReadback = () => {
    if (readbackInFlight) return;
    readbackInFlight = true;
    void computeQueue
      .whenComputeReady()
      .then(() => readCompactCountsFromGpu())
      .catch((err) => {
        console.error('[grass] compact count readback failed:', err);
      })
      .finally(() => {
        readbackInFlight = false;
      });
  };

  const syncBladeStatsFromGpu = async () => {
    if (!import.meta.env.DEV) return;
    await computeQueue.flushCompute();
    await readCompactCountsFromGpu();
  };

  /** D3: after rebuild/reinit, compact once with live uniforms before async draw resumes. */
  const finalizeFieldAfterGpuSync = async () => {
    computeQueue.setFieldReady(true);
    computeQueue.requestCompute();
    await computeQueue.whenComputeReady();
    await readCompactCountsFromGpu();
  };

  await fieldManager.bootComputeAll(
    renderer,
    fieldManager.state.ringFields,
    fieldManager.state.flowerField,
  );
  await readCompactCountsFromGpu();

  _prevPlayer.copy(grassSharedUniforms.uPlayerPosition.value);

  const compileGrass = async () => {
    if (!compileCamera) return;
    await renderer.compileAsync(scene, compileCamera);
  };

  const refreshGrassDataMap = () => {
    updateGrassDataTexture(grassDataMap, terrain.grids, mapGrassUniforms, terrainGrassMaps);
    grassDataDirty = true;
    staticFrameCount = 0;
    cameraOnlyCompactFrame = 0;
  };

  return {
    get mesh() {
      return fieldManager.state.fieldGroup.root;
    },

    whenComputeReady: computeQueue.whenComputeReady,
    isFieldReady: computeQueue.isFieldReady,

    requestCompactPass() {
      if (!fieldManager.state.fieldGroup.root.visible || !computeQueue.isFieldReady()) return;
      staticFrameCount = 0;
      cameraOnlyCompactFrame = 0;
      computeQueue.requestCompute();
    },

    reinitInstances: () =>
      computeQueue.enqueueBlockingGrassTask(async () => {
        await fieldManager.reinitAllInstances(renderer);
        lastCompactPerRing.fill(-1);
        lastFlowerCompact = -1;
        staticFrameCount = 0;
        cameraOnlyCompactFrame = 0;
        sceneWasDynamic = false;
        await finalizeFieldAfterGpuSync();
      }),

    rebuildField: () =>
      computeQueue.enqueueBlockingGrassTask(async () => {
        await fieldManager.rebuildAllRings(renderer);
        lastCompactPerRing.fill(-1);
        lastFlowerCompact = -1;
        staticFrameCount = 0;
        cameraOnlyCompactFrame = 0;
        sceneWasDynamic = false;
        await finalizeFieldAfterGpuSync();
        await compileGrass();
      }),

    rebuildRing: (ringIndex: number) =>
      computeQueue.enqueueBlockingGrassTask(async () => {
        if (ringIndex < 0 || ringIndex >= GRASS_RING_COUNT) return;
        await fieldManager.rebuildSingleRing(renderer, ringIndex);
        lastCompactPerRing.fill(-1);
        lastFlowerCompact = -1;
        staticFrameCount = 0;
        cameraOnlyCompactFrame = 0;
        sceneWasDynamic = false;
        await finalizeFieldAfterGpuSync();
        await compileGrass();
      }),

    update(params) {
      const {
        playerPosition,
        playerRadius,
        camera,
        elapsed,
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
        const playerDeltaSq =
          grassSharedUniforms.uPlayerDeltaXZ.value.x ** 2 +
          grassSharedUniforms.uPlayerDeltaXZ.value.y ** 2;
        const playerMoved = playerDeltaSq > GRASS_MOVE_EPS_SQ;
        const cameraMoved = cameraMatrixInitialized && !_prevCameraMatrix.equals(_cameraMatrix);
        const sceneDynamic = playerMoved || cameraMoved || grassDataDirty;
        const cameraOnlyMoved = cameraMoved && !playerMoved && !grassDataDirty;
        if (playerMoved || grassDataDirty) {
          cameraOnlyCompactFrame = 0;
        }
        const cameraThrottleSkip =
          cameraOnlyMoved &&
          GRASS_CAMERA_ONLY_COMPACT_EVERY_N > 1 &&
          cameraOnlyCompactFrame++ % GRASS_CAMERA_ONLY_COMPACT_EVERY_N !== 0;
        // Cadence (modulo), not latch: >= left trail/idle refresh true forever while static.
        const trailRefreshDue =
          staticFrameCount > 0 && staticFrameCount % GRASS_TRAIL_REFRESH_FRAMES === 0;
        const idleRingRefreshDue =
          staticFrameCount > 0 && staticFrameCount % GRASS_IDLE_RING_REFRESH_FRAMES === 0;
        const shouldCompute =
          (sceneDynamic && !cameraThrottleSkip) || trailRefreshDue || !cameraMatrixInitialized;

        if (!sceneDynamic && sceneWasDynamic) {
          sceneWasDynamic = false;
          scheduleCompactCountReadback();
        } else if (sceneDynamic) {
          sceneWasDynamic = true;
        }

        if (shouldCompute) {
          if (sceneDynamic) {
            staticFrameCount = 0;
          } else {
            staticFrameCount += 1;
          }

          _skipRingIndices.clear();
          const canSkipIdleRings = !sceneDynamic && !idleRingRefreshDue && !trailRefreshDue;
          if (canSkipIdleRings) {
            for (let i = 0; i < GRASS_RING_COUNT; i++) {
              if (lastCompactPerRing[i] === 0) _skipRingIndices.add(i);
            }
          }

          const skipFlower =
            canSkipIdleRings && lastFlowerCompact === 0 && fieldManager.state.flowerField !== null;
          const skipAllGrass = _skipRingIndices.size === GRASS_RING_COUNT;
          if (!skipAllGrass || !skipFlower) {
            // Snapshot the Set — the compute queue may run after the next update() clears it.
            computeQueue.requestCompute({
              skipRingIndices: _skipRingIndices.size > 0 ? new Set(_skipRingIndices) : undefined,
              skipFlower,
            });
            if (idleRingRefreshDue && !sceneDynamic) {
              scheduleCompactCountReadback();
            }
          }

          if (grassDataDirty) grassDataDirty = false;
        } else if (!sceneDynamic) {
          staticFrameCount += 1;
        }

        _prevCameraMatrix.copy(_cameraMatrix);
        cameraMatrixInitialized = true;
      }

      fieldManager.setWorldPosition(playerPosition.x, playerPosition.z);
      _prevPlayer.copy(playerPosition);
    },

    onTerrainMapsUpdated() {
      terrain.applyHeightsToMesh();
      if (
        !runtimeSettings.grass.enabled ||
        !fieldManager.state.fieldGroup.root.visible ||
        !computeQueue.isFieldReady()
      ) {
        return;
      }
      refreshGrassDataMap();
      staticFrameCount = 0;
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
          compactedVisibleTotal ?? rings.reduce((sum, r) => sum + r.compactedVisible, 0),
      };
    },

    syncBladeStatsFromGpu,

    dispose() {
      void (async () => {
        await computeQueue.dispose();
        fieldManager.dispose();
        grassDataMap.dispose();
        windAtlas?.dispose();
        flowerSprite?.dispose();
      })();
    },
  };
}
