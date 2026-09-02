// src/world/grass/core/GrassSystem.ts — player-follow biome grass (3 independent LOD rings)
import type { DirectionalLight, Group, PerspectiveCamera, Scene } from 'three';
import { Matrix4, Vector2, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { AssetRegistry } from '../../../assets/assetManifest';
import { createKtx2Loader } from '../../../assets/createKtx2Loader';
import { devDebugSettings, runtimeSettings } from '../../../core/GameState';
import {
  grassIsolateFlowerHidden,
  grassIsolateKey,
  grassIsolateRingHidden,
} from '../../../core/state/grassIsolateDebug';
import type { MapEntity, MapGrassSettings } from '../../../map/MapTypes';
import { mapGrassToUniforms } from '../../../map/mapGrassSettings';
import {
  createFarOnlySunShadowNode,
  createReceiverSunShadowNode,
} from '../../../rendering/sunShadow';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { createTerrainSurfaceHeightTsl } from '../../terrain/tsl/terrainSurfaceHeightTsl';
import { WORLD } from '../../WorldConfig';
import {
  GRASS_CAMERA_MOVE_FORWARD_DOT,
  GRASS_CAMERA_MOVE_POS_M,
  GRASS_MOVE_EPS_SQ,
  GRASS_RING_COUNT,
  GRASS_TRAIL_SETTLE_SEC,
} from '../config/grassConfig';
import { grassSharedUniforms, syncGrassFrustumPlanes } from '../config/grassUniforms';
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
  camera: PerspectiveCamera;
  elapsed: number;
  dt: number;
  daylight: number;
  playerLightDistance: number;
  playerLightIntensity: number;
}

export interface GrassSystemInitOptions {
  sun: DirectionalLight;
  /** Player spawn — boot compact samples terrain relative to this, not the origin. */
  playerPosition: Vector3;
  /** Play camera — tile-mark frustum must match the first draw, not an identity matrix. */
  camera: PerspectiveCamera;
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
  }>;
  biomeGrassThreshold: number;
  biomeGrassFadeWidth: number;
  /** Map-weighted expected visible fraction after stochastic biome cull. */
  estimatedVisibleFraction: number;
  estimatedVisibleTotal: number;
  flowerAllocated: number;
}

export interface GrassSystem {
  mesh: Group;
  update: (params: GrassUpdateParams) => void;
  /** Await at rebuild/dispose boundaries — gameplay compact is CPU-sync in update(). */
  whenComputeReady: () => Promise<void>;
  /** False while a blocking rebuild task holds the field. */
  isFieldReady: () => boolean;
  /** Force a compact pass (e.g. trail dev sliders while player is static). */
  requestCompactPass: () => void;
  rebuildField: () => Promise<void>;
  onTerrainMapsUpdated: () => void;
  refreshGrassDataMap: () => void;
  getBladeStats: () => GrassBladeStats;
  dispose: () => void;
}

const _lastCompactPlayerXZ = new Vector2();
const _cameraMatrix = new Matrix4();
const _cameraForward = new Vector3();
const _prevCameraPosition = new Vector3();
const _prevCameraForward = new Vector3();
const _skipRingIndices = new Set<number>();

const CAMERA_MOVE_POS_EPS_SQ = GRASS_CAMERA_MOVE_POS_M * GRASS_CAMERA_MOVE_POS_M;

/** Player XZ/Y + frustum planes + fy the compact kernels read. */
function syncGrassFollowUniforms(playerPosition: Vector3, camera: PerspectiveCamera): void {
  grassSharedUniforms.uPlayerPosition.value.copy(playerPosition);
  camera.getWorldPosition(grassSharedUniforms.uCameraPosition.value);
  _cameraMatrix.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
  syncGrassFrustumPlanes(_cameraMatrix, camera);
  grassSharedUniforms.uFy.value = camera.projectionMatrix.elements[5];
  camera.getWorldDirection(_cameraForward);
}

export async function initGrassSystem(
  scene: Scene,
  renderer: WebGPURenderer,
  terrain: MapTerrainContext,
  options: GrassSystemInitOptions,
): Promise<GrassSystem> {
  const sunShadow = createReceiverSunShadowNode(options.sun);
  const farSunShadow = createFarOnlySunShadowNode(options.sun);
  grassSharedUniforms.uWorldSize.value = WORLD.SIZE;
  grassSharedUniforms.uHeightScale.value = WORLD.HEIGHT_SCALE;
  const mapGrassUniforms = mapGrassToUniforms(options?.mapGrass);
  const terrainGrassMaps = {
    biomeMap: terrain.biomeMap,
    meadowMap: terrain.meadowMap,
    pathMap: terrain.pathMap,
  };
  const grassFillOpts = {
    waterHeightNorm: terrain.waterLevelM / WORLD.HEIGHT_SCALE,
  };
  const grassDataMap = createGrassDataTexture(
    terrain.grids,
    mapGrassUniforms,
    terrainGrassMaps,
    grassFillOpts,
  );
  const propExclusionMap =
    options.mapEntities && options.assets
      ? createPropGrassExclusionTexture(terrain, options.mapEntities, options.assets)
      : createEmptyPropGrassExclusionTexture(terrain.grids.size);
  const ktx2Loader = createKtx2Loader(renderer);
  const windAtlas = await loadGrassWindAtlas(ktx2Loader);
  const flowerSprite = await loadFlowerSprite(ktx2Loader);

  const terrainSurfaceHeight = createTerrainSurfaceHeightTsl({
    uniforms: terrain.splatMaterial.terrainUniforms,
    macroHeight: terrain.splatMaterial.macroHeight,
  });

  const fieldManager = createGrassFieldManager(
    scene,
    {
      grassDataMap,
      propExclusionMap,
      windAtlas,
      flowerSprite,
      sunShadow,
      farSunShadow,
      terrainSurfaceHeight,
    },
    options.onMeshReplaced,
  );

  let grassDataDirty = false;
  let lastGrassIsolateKey = '';
  /** Seconds of trail recovery compact remaining after last player/data move. */
  let trailSettleRemaining = 0;
  /** Seconds since last compact consumed dt (trail crush + wind damping). */
  let pendingCompactDt = 0;
  let pendingInvalidateTerrainCache = false;

  let cachedVisibleFraction = 0;
  let cachedVisibleThreshold = Number.NaN;
  let cachedVisibleFadeWidth = Number.NaN;

  let compileCamera: PerspectiveCamera | null = null;

  const refreshEstimatedVisibleFraction = () => {
    const threshold = grassSharedUniforms.uBiomeGrassThreshold.value;
    const fadeWidth = grassSharedUniforms.uBiomeGrassFadeWidth.value;
    if (
      threshold === cachedVisibleThreshold &&
      fadeWidth === cachedVisibleFadeWidth &&
      Number.isFinite(cachedVisibleFraction)
    ) {
      return;
    }
    const data = grassDataMap.image.data as Uint8Array;
    cachedVisibleFraction = estimateGrassVisibilityFraction(data, threshold, fadeWidth);
    cachedVisibleThreshold = threshold;
    cachedVisibleFadeWidth = fadeWidth;
  };

  const consumePendingCompactUniforms = () => {
    grassSharedUniforms.uPrevPlayerXZ.value.copy(_lastCompactPlayerXZ);
    grassSharedUniforms.uCompactDeltaTime.value = pendingCompactDt;
    pendingCompactDt = 0;
    grassSharedUniforms.uInvalidateTerrainCache.value = pendingInvalidateTerrainCache ? 1 : 0;
    pendingInvalidateTerrainCache = false;
  };

  const rememberCompactPlayer = () => {
    _lastCompactPlayerXZ.set(
      grassSharedUniforms.uPlayerPosition.value.x,
      grassSharedUniforms.uPlayerPosition.value.z,
    );
  };

  /** Rebuild/reinit already sampled current player — do not wrap by the rebuild window. */
  const clearPendingCompactUniforms = () => {
    pendingCompactDt = 0;
    pendingInvalidateTerrainCache = false;
    rememberCompactPlayer();
    grassSharedUniforms.uPrevPlayerXZ.value.copy(_lastCompactPlayerXZ);
    grassSharedUniforms.uCompactDeltaTime.value = 0;
    grassSharedUniforms.uInvalidateTerrainCache.value = 0;
  };

  const computeQueue = createGrassComputeQueue(
    renderer,
    () => fieldManager.state.ringFields.map((f) => f.ssbo),
    () => fieldManager.state.flowerField?.ssbo ?? null,
  );

  const mergeIsolateSkips = (skip: Set<number>): boolean => {
    if (!import.meta.env.DEV) return false;
    const d = devDebugSettings.renderDebug;
    for (let i = 0; i < GRASS_RING_COUNT; i++) {
      if (grassIsolateRingHidden(d, i)) skip.add(i);
    }
    return grassIsolateFlowerHidden(d);
  };

  const buildIsolateComputeRequest = () => {
    const skipRingIndices = new Set<number>();
    const skipFlower = mergeIsolateSkips(skipRingIndices);
    if (skipRingIndices.size === 0 && !skipFlower) return undefined;
    return {
      skipRingIndices: skipRingIndices.size > 0 ? skipRingIndices : undefined,
      skipFlower,
    };
  };

  const applyIsolateVisibility = () => {
    if (!import.meta.env.DEV) return;
    const d = devDebugSettings.renderDebug;
    for (const field of fieldManager.state.ringFields) {
      field.setVisible(!grassIsolateRingHidden(d, field.ringIndex));
    }
    const flower = fieldManager.state.flowerField;
    if (flower && grassIsolateFlowerHidden(d)) flower.setVisible(false);
  };

  const runCompactNow = (request?: ReturnType<typeof buildIsolateComputeRequest>) => {
    consumePendingCompactUniforms();
    computeQueue.runCompactPass(request);
    rememberCompactPlayer();
  };

  /** After rebuild, compact once with live uniforms before draw resumes. */
  const finalizeFieldAfterGpuSync = async () => {
    clearPendingCompactUniforms();
    computeQueue.setFieldReady(true);
    computeQueue.runCompactPass(buildIsolateComputeRequest());
    rememberCompactPlayer();
  };

  options.camera.updateMatrixWorld();
  syncGrassFollowUniforms(options.playerPosition, options.camera);
  fieldManager.setWorldPosition(options.playerPosition.x, options.playerPosition.z);
  _lastCompactPlayerXZ.set(options.playerPosition.x, options.playerPosition.z);
  grassSharedUniforms.uPrevPlayerXZ.value.copy(_lastCompactPlayerXZ);
  _prevCameraPosition.copy(grassSharedUniforms.uCameraPosition.value);
  _prevCameraForward.copy(_cameraForward);
  compileCamera = options.camera;
  refreshEstimatedVisibleFraction();

  await fieldManager.boot(renderer);

  const compileGrass = async () => {
    if (!compileCamera) return;
    await renderer.compileAsync(scene, compileCamera);
  };

  const refreshGrassDataMap = () => {
    updateGrassDataTexture(
      grassDataMap,
      terrain.grids,
      mapGrassUniforms,
      terrainGrassMaps,
      grassFillOpts,
    );
    grassDataDirty = true;
    pendingInvalidateTerrainCache = true;
    trailSettleRemaining = GRASS_TRAIL_SETTLE_SEC;
    cachedVisibleThreshold = Number.NaN;
  };

  const runBlockingRebuild = () =>
    computeQueue.enqueueBlockingGrassTask(async () => {
      await fieldManager.rebuildAll(renderer);
      trailSettleRemaining = 0;
      await finalizeFieldAfterGpuSync();
      await compileGrass();
    });

  return {
    get mesh() {
      return fieldManager.state.fieldGroup.root;
    },

    whenComputeReady: computeQueue.whenComputeReady,
    isFieldReady: computeQueue.isFieldReady,

    requestCompactPass() {
      if (!fieldManager.state.fieldGroup.root.visible || !computeQueue.isFieldReady()) return;
      trailSettleRemaining = GRASS_TRAIL_SETTLE_SEC;
      runCompactNow(buildIsolateComputeRequest());
    },

    rebuildField: runBlockingRebuild,

    update(params) {
      const {
        playerPosition,
        camera,
        elapsed,
        dt,
        daylight,
        playerLightDistance,
        playerLightIntensity,
      } = params;
      compileCamera = camera;

      const frameDx = playerPosition.x - _lastCompactPlayerXZ.x;
      const frameDz = playerPosition.z - _lastCompactPlayerXZ.y;
      pendingCompactDt += Math.max(0, dt);

      camera.updateMatrixWorld();
      syncGrassFollowUniforms(playerPosition, camera);
      grassSharedUniforms.uTime.value = elapsed;
      grassSharedUniforms.uDaylight.value = daylight;
      grassSharedUniforms.uLightRadius.value = playerLightDistance;
      grassSharedUniforms.uLightIntensity.value = playerLightIntensity;

      let isolateChanged = false;
      if (import.meta.env.DEV) {
        const isolateKey = grassIsolateKey(devDebugSettings.renderDebug);
        isolateChanged = isolateKey !== lastGrassIsolateKey;
        lastGrassIsolateKey = isolateKey;
      }

      if (fieldManager.state.fieldGroup.root.visible && computeQueue.isFieldReady()) {
        const playerMoved = frameDx * frameDx + frameDz * frameDz > GRASS_MOVE_EPS_SQ;
        const cameraMoved =
          grassSharedUniforms.uCameraPosition.value.distanceToSquared(_prevCameraPosition) >
            CAMERA_MOVE_POS_EPS_SQ ||
          _prevCameraForward.dot(_cameraForward) < GRASS_CAMERA_MOVE_FORWARD_DOT;

        if (playerMoved || grassDataDirty) {
          trailSettleRemaining = GRASS_TRAIL_SETTLE_SEC;
        } else if (trailSettleRemaining > 0) {
          trailSettleRemaining = Math.max(0, trailSettleRemaining - Math.max(0, dt));
        }

        const shouldCompute =
          playerMoved ||
          cameraMoved ||
          grassDataDirty ||
          trailSettleRemaining > 0 ||
          isolateChanged;

        if (shouldCompute) {
          _skipRingIndices.clear();
          const isolateSkipFlower = mergeIsolateSkips(_skipRingIndices);
          const skipFlower = isolateSkipFlower;
          const skipAllGrass = _skipRingIndices.size === GRASS_RING_COUNT;
          if (!skipAllGrass || !skipFlower) {
            runCompactNow({
              skipRingIndices: _skipRingIndices.size > 0 ? new Set(_skipRingIndices) : undefined,
              skipFlower,
            });
            if (grassDataDirty) grassDataDirty = false;
          }
        }
      }

      fieldManager.setWorldPosition(playerPosition.x, playerPosition.z);
      applyIsolateVisibility();
      _prevCameraPosition.copy(grassSharedUniforms.uCameraPosition.value);
      _prevCameraForward.copy(_cameraForward);
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
      runCompactNow(buildIsolateComputeRequest());
    },

    refreshGrassDataMap,

    getBladeStats(): GrassBladeStats {
      refreshEstimatedVisibleFraction();
      const threshold = grassSharedUniforms.uBiomeGrassThreshold.value;
      const fadeWidth = grassSharedUniforms.uBiomeGrassFadeWidth.value;
      const rings = fieldManager.state.ringFields.map((field, ringIndex) => ({
        ringIndex,
        instanceCount: field.layout.instanceCount,
        bladesPerSide: field.layout.bladesPerSide,
      }));
      const allocatedTotal = rings.reduce((sum, r) => sum + r.instanceCount, 0);
      const flowerField = fieldManager.state.flowerField;
      return {
        allocatedTotal,
        rings,
        biomeGrassThreshold: threshold,
        biomeGrassFadeWidth: fadeWidth,
        estimatedVisibleFraction: cachedVisibleFraction,
        estimatedVisibleTotal: Math.round(allocatedTotal * cachedVisibleFraction),
        flowerAllocated: flowerField?.layout.instanceCount ?? 0,
      };
    },

    dispose() {
      void (async () => {
        await computeQueue.dispose();
        fieldManager.dispose();
        grassDataMap.dispose();
        windAtlas.dispose();
        flowerSprite.dispose();
      })();
    },
  };
}
