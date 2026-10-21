// src/world/grass/core/GrassSystem.ts — player-follow biome grass (3 independent LOD rings)
import type {
  DataTexture,
  DirectionalLight,
  Group,
  LineBasicMaterial,
  PerspectiveCamera,
  Scene,
} from 'three';
import { CameraHelper, Matrix4, Vector2, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { AssetRegistry } from '../../../assets/assetManifest';
import { createKtx2Loader } from '../../../assets/createKtx2Loader';
import { WORLD } from '../../../config/world';
import { devDebugSettings, runtimeSettings } from '../../../core/settings';
import {
  grassIsolateFlowerHidden,
  grassIsolateKey,
  grassIsolateRingHidden,
} from '../../../core/state/grassIsolateDebug';
import { uploadDataTextureRegion } from '../../../map/MapGrids';
import type { MapEntity, MapGrassSettings } from '../../../map/MapTypes';
import { mapGrassToUniforms } from '../../../map/mapGrassSettings';
import {
  createFarOnlySunShadowNode,
  createReceiverSunShadowNode,
} from '../../../rendering/sunShadow';
import { currentSunElevationDeg } from '../../../rendering/sunSpherical';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { createTerrainSurfaceHeightTsl } from '../../terrain/tsl/terrainSurfaceHeightTsl';
import {
  GRASS_CAMERA_MOVE_FORWARD_DOT,
  GRASS_CAMERA_MOVE_POS_M,
  GRASS_MOVE_EPS_SQ,
  GRASS_RING_COUNT,
  GRASS_TRAIL_SETTLE_SEC,
} from '../config/grassConfig';
import {
  grassSharedUniforms,
  syncGrassFrustumPlanes,
  syncGrassTodColors,
} from '../config/grassUniforms';
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
import { paintWheatField, type WheatField } from '../data/wheatFieldMask';
import { createGrassComputeQueue, type GrassComputeRequest } from './grassComputeQueue';
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
  /** R8 mask grass reads live on every compact pass: 255 = grass, lower = suppressed (min-blend stamps). */
  readonly propExclusionMap: DataTexture;
  update: (params: GrassUpdateParams) => void;
  /** Await at rebuild/dispose boundaries — gameplay compact is CPU-sync in update(). */
  whenComputeReady: () => Promise<void>;
  /** False while a blocking rebuild task holds the field. */
  isFieldReady: () => boolean;
  /** Force a compact pass (e.g. trail dev sliders while player is static). */
  requestCompactPass: () => void;
  /** Terrain heights changed under live blades (levelling): recompute their cached height on the next compact. */
  invalidateTerrainHeights: () => void;
  /** Mark (or re-mark) a plot as a wheat field: grass in it turns even, unclumped and gold as `ripeness` rises. */
  setWheatField: (field: WheatField) => void;
  /** DEV: hold the cull planes at the current view and draw that frustum, to inspect culling from outside. */
  setCullCameraFrozen: (frozen: boolean) => void;
  rebuildField: () => Promise<void>;
  refreshGrassDataMap: () => void;
  getBladeStats: () => GrassBladeStats;
  dispose: () => void;
}

const _lastCompactPlayerXZ = new Vector2();
const _cameraMatrix = new Matrix4();
const _cameraForward = new Vector3();
const _cameraPosition = new Vector3();
const _prevCameraPosition = new Vector3();
const _prevCameraForward = new Vector3();
/** Projection x/y scale (aspect + FOV) — side planes change on resize without any camera move. */
const _cameraProjScale = new Vector2();
const _prevCameraProjScale = new Vector2();
const _skipRingIndices = new Set<number>();

const CAMERA_MOVE_POS_EPS_SQ = GRASS_CAMERA_MOVE_POS_M * GRASS_CAMERA_MOVE_POS_M;

/** Player XZ/Y + frustum planes + fy the compact kernels read. */
function syncGrassFollowUniforms(playerPosition: Vector3, camera: PerspectiveCamera): void {
  grassSharedUniforms.uPlayerPosition.value.copy(playerPosition);
  // World matrix can be stale before the renderer tick. The camera position feeds the CPU
  // compact-move check only — screen keep uses player-wrapped XZ, not this.
  camera.updateMatrixWorld();
  camera.getWorldPosition(_cameraPosition);
  // Same composition as Renderer._projScreenMatrix (P * V).
  _cameraMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  syncGrassFrustumPlanes(_cameraMatrix, camera);
  // FOV-based fy — stable across WebGL/WebGPU projection layouts (elements[5] is also fy,
  // but keep this explicit so screen thinning does not depend on matrix packing).
  const fovRad = (camera.fov * Math.PI) / 180;
  grassSharedUniforms.uFy.value = 1 / Math.tan(fovRad * 0.5);
  camera.getWorldDirection(_cameraForward);
  _cameraProjScale.set(camera.projectionMatrix.elements[0]!, camera.projectionMatrix.elements[5]!);
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
  // The village writes roads into the overlay's path channel after founding. Grass density bakes
  // from the authored masks only (wear clears grass through the exclusion map), so DEV re-bakes read
  // a copy taken now; production never re-bakes and reads the live array.
  const overlayData = terrain.overlayMap.image.data as Uint8Array;
  const terrainGrassMaps = {
    biomeMap: terrain.biomeMap,
    overlay: import.meta.env.DEV ? new Uint8Array(overlayData) : overlayData,
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
    // Blade height follows the village's levelled ground when the map has a detail layer.
    macroHeight: terrain.fine?.macroHeight ?? terrain.splatMaterial.macroHeight,
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
  let frozenCull: {
    camera: PerspectiveCamera;
    viewProjection: Matrix4;
    helper: CameraHelper;
  } | null = null;

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
    _prevCameraPosition.copy(_cameraPosition);
    _prevCameraForward.copy(_cameraForward);
    _prevCameraProjScale.copy(_cameraProjScale);
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

  const computeQueue = createGrassComputeQueue(renderer, () =>
    fieldManager.state.ringFields.map((f) => f.ssbo),
  );

  const mergeIsolateSkips = (skip: Set<number>): void => {
    if (!import.meta.env.DEV) return;
    const d = devDebugSettings.renderDebug;
    for (let i = 0; i < GRASS_RING_COUNT; i++) {
      if (grassIsolateRingHidden(d, i)) skip.add(i);
    }
  };

  const buildIsolateComputeRequest = (): GrassComputeRequest | undefined => {
    const skipRingIndices = new Set<number>();
    mergeIsolateSkips(skipRingIndices);
    if (skipRingIndices.size === 0) return undefined;
    return { skipRingIndices };
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

  const runCompactNow = (request?: GrassComputeRequest) => {
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

  syncGrassFollowUniforms(options.playerPosition, options.camera);
  syncGrassTodColors(currentSunElevationDeg(), runtimeSettings.grass.colorStops);
  fieldManager.setWorldPosition(options.playerPosition.x, options.playerPosition.z);
  _lastCompactPlayerXZ.set(options.playerPosition.x, options.playerPosition.z);
  grassSharedUniforms.uPrevPlayerXZ.value.copy(_lastCompactPlayerXZ);
  _prevCameraPosition.copy(_cameraPosition);
  _prevCameraForward.copy(_cameraForward);
  _prevCameraProjScale.copy(_cameraProjScale);
  compileCamera = options.camera;
  refreshEstimatedVisibleFraction();

  await fieldManager.boot(renderer);

  const compileGrass = async () => {
    if (!compileCamera) return;
    await renderer.compileAsync(scene, compileCamera);
  };

  const wheatFields = new Map<number, WheatField>();
  const refreshGrassDataMap = () => {
    updateGrassDataTexture(
      grassDataMap,
      terrain.grids,
      mapGrassUniforms,
      terrainGrassMaps,
      grassFillOpts,
    );
    // The re-bake wrote the whole map: put the wheat fields back (the texture is already marked for a full upload).
    for (const field of wheatFields.values()) {
      paintWheatField(grassDataMap.image.data as Uint8Array, terrain.grids.size, field);
    }
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

  const requestCompactPass = () => {
    if (!fieldManager.state.fieldGroup.root.visible || !computeQueue.isFieldReady()) return;
    trailSettleRemaining = GRASS_TRAIL_SETTLE_SEC;
    runCompactNow(buildIsolateComputeRequest());
  };

  const invalidateTerrainHeights = () => {
    pendingInvalidateTerrainCache = true;
    requestCompactPass();
  };

  const setWheatField = (field: WheatField) => {
    wheatFields.set(field.id, field);
    const region = paintWheatField(
      grassDataMap.image.data as Uint8Array,
      terrain.grids.size,
      field,
    );
    if (region) uploadDataTextureRegion(renderer, grassDataMap, region, 4);
    requestCompactPass();
  };

  const releaseFrozenCull = () => {
    if (!frozenCull) return;
    scene.remove(frozenCull.helper);
    frozenCull.helper.dispose();
    frozenCull = null;
  };

  return {
    get mesh() {
      return fieldManager.state.fieldGroup.root;
    },
    propExclusionMap,

    whenComputeReady: computeQueue.whenComputeReady,
    isFieldReady: computeQueue.isFieldReady,

    setWheatField,
    requestCompactPass,
    invalidateTerrainHeights,

    setCullCameraFrozen(frozen) {
      if (!import.meta.env.DEV) return;
      releaseFrozenCull();
      if (frozen && compileCamera) {
        compileCamera.updateMatrixWorld();
        const camera = compileCamera.clone();
        compileCamera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
        // Far plane at the outermost ring edge, so the helper's far rectangle marks the grass reach.
        camera.far = Math.max(
          camera.near + 1,
          ...fieldManager.state.ringFields.map((f) => f.layout.outerRadius),
        );
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        const viewProjection = new Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        );
        const helper = new CameraHelper(camera);
        const material = helper.material as LineBasicMaterial;
        material.depthTest = false;
        material.fog = false;
        helper.renderOrder = 1000;
        scene.add(helper);
        frozenCull = { camera, viewProjection, helper };
      }
      requestCompactPass();
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

      syncGrassFollowUniforms(playerPosition, camera);
      if (frozenCull) syncGrassFrustumPlanes(frozenCull.viewProjection, frozenCull.camera);
      grassSharedUniforms.uTime.value = elapsed;
      grassSharedUniforms.uDaylight.value = daylight;
      grassSharedUniforms.uLightRadius.value = playerLightDistance;
      grassSharedUniforms.uLightIntensity.value = playerLightIntensity;
      syncGrassTodColors(currentSunElevationDeg(), runtimeSettings.grass.colorStops);

      let isolateChanged = false;
      if (import.meta.env.DEV) {
        const isolateKey = grassIsolateKey(devDebugSettings.renderDebug);
        isolateChanged = isolateKey !== lastGrassIsolateKey;
        lastGrassIsolateKey = isolateKey;
      }

      if (fieldManager.state.fieldGroup.root.visible && computeQueue.isFieldReady()) {
        const playerMoved = frameDx * frameDx + frameDz * frameDz > GRASS_MOVE_EPS_SQ;
        const cameraMoved =
          _cameraPosition.distanceToSquared(_prevCameraPosition) > CAMERA_MOVE_POS_EPS_SQ ||
          _prevCameraForward.dot(_cameraForward) < GRASS_CAMERA_MOVE_FORWARD_DOT ||
          !_prevCameraProjScale.equals(_cameraProjScale);

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
          mergeIsolateSkips(_skipRingIndices);
          if (_skipRingIndices.size < GRASS_RING_COUNT) {
            runCompactNow({
              skipRingIndices: _skipRingIndices.size > 0 ? new Set(_skipRingIndices) : undefined,
            });
            if (grassDataDirty) grassDataDirty = false;
          }
        }
      }

      fieldManager.setWorldPosition(playerPosition.x, playerPosition.z);
      applyIsolateVisibility();
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
      releaseFrozenCull();
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
