// src/world/grass/GrassSystem.ts — player-follow biome grass field
import type { PerspectiveCamera, Scene } from 'three';
import { Group, Matrix4, Vector2, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { MapGrassSettings } from '../../map/MapTypes';
import { WORLD } from '../WorldConfig';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { applyMapGrassSettings } from './applyMapGrassSettings';
import { GRASS_CONFIG, grassInstanceCount } from './grassConfig';
import { GrassSsbo } from './grassSsbo';
import { grassUniforms } from './grassUniforms';
import { loadGrassWindAtlas } from './loadGrassWindAtlas';
import {
  chooseGrassComputePass,
  GRASS_MOVE_EPS_SQ,
  resetGrassComputeSchedule,
  type GrassComputePass,
} from './grassComputeSchedule';
import {
  getGrassPerfSnapshot,
  incrementGrassSkippedComputeFrames,
  recordGrassComputeEnd,
  recordGrassComputePass,
  recordGrassComputeStart,
  setGrassComputeQueue,
  type GrassPerfSnapshot,
} from './grassPerfStats';
import {
  createGrassDataTexture,
  grassDataDensitiesFromUniforms,
  updateGrassDataTexture,
} from './grassDataTexture';
import { createGrassLodField, type GrassLodDrawStats } from './grassLodField';
import { grassLodRadiusSq, partitionGrassLodByOffsets } from './grassLodPartition';
import {
  createGrassTileOffsets,
  wrapGrassTileOffsets,
  type GrassTileOffsets,
} from './grassTileOffsets';
import { grassLodDualDrawEnabled, readGrassFieldDerived } from './grassConfig';
import { formatGrassFieldSummary } from './grassFieldMetrics';
import { devSettings } from '../../core/GameState';

export interface GrassUpdateParams {
  playerPosition: Vector3;
  playerRadius: number;
  camera: PerspectiveCamera;
  elapsed: number;
  sunIntensity: number;
}

export interface GrassSystemInitOptions {
  mapGrass?: MapGrassSettings;
  onMeshReplaced?: (root: Group) => void;
}

export interface GrassSystem {
  /** Scene root (`grassField` group with near + far LOD meshes). */
  mesh: Group;
  update: (params: GrassUpdateParams) => void;
  reinitInstances: () => Promise<void>;
  rebuildField: () => Promise<void>;
  onTerrainMapsUpdated: () => void;
  refreshGrassDataMap: () => void;
  getPerfSnapshot: () => GrassPerfSnapshot;
  getLodDrawStats: () => GrassLodDrawStats;
  dispose: () => void;
}

const _prevPlayer = new Vector3();
const _deltaXZ = new Vector2();
const _cameraMatrix = new Matrix4();
const _cameraForward = new Vector3();

export async function initGrassSystem(
  scene: Scene,
  renderer: WebGPURenderer,
  terrain: MapTerrainContext,
  options?: GrassSystemInitOptions,
): Promise<GrassSystem> {
  grassUniforms.uWorldSize.value = WORLD.SIZE;
  grassUniforms.uHeightScale.value = WORLD.HEIGHT_SCALE;
  const mapGrassUniforms = applyMapGrassSettings(options?.mapGrass);
  const grassDataDensities = () =>
    grassDataDensitiesFromUniforms(mapGrassUniforms, grassUniforms.uBiomeGrassThreshold.value);
  let grassDataMap = createGrassDataTexture(terrain.grids, grassDataDensities());
  const windAtlas = await loadGrassWindAtlas();
  if (import.meta.env.DEV && windAtlas) {
    console.info('[grass] Using wind noise atlas');
  }

  const materialMaps = { biomeMap: terrain.biomeMap, pathMap: terrain.pathMap };

  const initialCount = grassInstanceCount();
  let tileOffsets: GrassTileOffsets | undefined = grassLodDualDrawEnabled()
    ? createGrassTileOffsets(initialCount)
    : undefined;
  let ssbo = new GrassSsbo(grassDataMap, initialCount, windAtlas);
  let lodField = createGrassLodField(ssbo, materialMaps, windAtlas, tileOffsets);
  scene.add(lodField.root);

  if (import.meta.env.DEV) {
    const { stats } = lodField;
    const layout = readGrassFieldDerived();
    console.info(`[grass] ${formatGrassFieldSummary(layout)}`);
    console.info(
      `[grass] LOD ${stats.dualDraw ? 'dual' : 'single'} near ${stats.nearInstances.toLocaleString()} (${stats.nearSegments} seg) | far ${stats.farInstances.toLocaleString()} (${stats.farSegments} seg) @ LOD0=${GRASS_CONFIG.LOD_RADIUS}m`,
    );
  }

  const bootCompute = async (target: GrassSsbo) => {
    await renderer.computeAsync(target.computeInit);
    await renderer.computeAsync(target.computeUpdate);
  };
  await bootCompute(ssbo);

  _prevPlayer.copy(grassUniforms.uPlayerPosition.value);

  let compileCamera: PerspectiveCamera | null = null;
  let fieldReady = true;
  let computeInFlight = false;
  let pendingFull = false;
  let pendingVisibility = false;
  let idleFrames = 0;
  let grassTask: Promise<void> = Promise.resolve();

  const refreshGrassDataMap = () => {
    mapGrassUniforms.forestDensity = grassUniforms.uForestDensity.value;
    mapGrassUniforms.hillsDensity = grassUniforms.uHillsDensity.value;
    mapGrassUniforms.shoreDensity = grassUniforms.uShoreDensity.value;
    updateGrassDataTexture(grassDataMap, terrain.grids, grassDataDensities());
  };

  const enqueueGrassTask = (task: () => Promise<void>): Promise<void> => {
    const run = grassTask.then(task, task);
    grassTask = run.catch(() => {});
    return run;
  };

  const compileGrass = async () => {
    if (!compileCamera) return;
    await renderer.compileAsync(scene, compileCamera);
  };

  const rebuildLodDraw = (nextSsbo: GrassSsbo) => {
    lodField.dispose();
    scene.remove(lodField.root);
    ssbo = nextSsbo;
    if (grassLodDualDrawEnabled()) {
      tileOffsets = createGrassTileOffsets();
    }
    lodField = createGrassLodField(ssbo, materialMaps, windAtlas, tileOffsets);
    scene.add(lodField.root);
    options?.onMeshReplaced?.(lodField.root);
  };

  const requestCompute = (pass: GrassComputePass) => {
    if (!fieldReady) return;
    if (pass === 'full') {
      pendingFull = true;
      pendingVisibility = false;
    } else if (!pendingFull) {
      pendingVisibility = true;
    }
    if (computeInFlight) return;
    computeInFlight = true;
    const drain = async () => {
      while (pendingFull || pendingVisibility) {
        const passKind: GrassComputePass = pendingFull ? 'full' : 'visibility';
        if (pendingFull) {
          pendingFull = false;
          pendingVisibility = false;
        } else {
          pendingVisibility = false;
        }
        const t0 = performance.now();
        recordGrassComputeStart();
        recordGrassComputePass(passKind);
        try {
          const node = passKind === 'full' ? ssbo.computeUpdate : ssbo.computeVisibility;
          await renderer.computeAsync(node);
          recordGrassComputeEnd(performance.now() - t0);
        } catch (err) {
          console.error('[grass] computeAsync failed:', err);
          break;
        }
      }
    };
    void drain().finally(() => {
      computeInFlight = false;
      if (import.meta.env.DEV) {
        setGrassComputeQueue(false, pendingFull || pendingVisibility);
      }
      if (pendingFull || pendingVisibility) requestCompute(pendingFull ? 'full' : 'visibility');
    });
  };

  const rebuildFieldOnce = async () => {
    fieldReady = false;
    lodField.nearMesh.count = 0;
    lodField.farMesh.count = 0;

    const instanceCount = grassInstanceCount();
    refreshGrassDataMap();
    const newSsbo = new GrassSsbo(grassDataMap, instanceCount, windAtlas);
    await bootCompute(newSsbo);

    ssbo = newSsbo;
    rebuildLodDraw(newSsbo);

    fieldReady = true;
    resetGrassComputeSchedule();
    await compileGrass();
  };

  return {
    get mesh() {
      return lodField.root;
    },

    reinitInstances: () =>
      enqueueGrassTask(async () => {
        if (!fieldReady) return;
        await renderer.computeAsync(ssbo.computeInit);
      }),

    rebuildField: () => enqueueGrassTask(rebuildFieldOnce),

    update(params) {
      const { playerPosition, playerRadius, camera, elapsed, sunIntensity } = params;
      compileCamera = camera;

      lodField.setPosition(playerPosition.x, 0, playerPosition.z);

      _deltaXZ.set(
        playerPosition.x - _prevPlayer.x,
        playerPosition.z - _prevPlayer.z,
      );
      _prevPlayer.copy(playerPosition);

      grassUniforms.uPlayerDeltaXZ.value.copy(_deltaXZ);
      grassUniforms.uPlayerPosition.value.copy(playerPosition);
      grassUniforms.uPlayerRadius.value = playerRadius;
      grassUniforms.uTime.value = elapsed;
      grassUniforms.uSunIntensity.value = sunIntensity;

      camera.updateMatrixWorld();
      _cameraMatrix.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      grassUniforms.uCameraMatrix.value.copy(_cameraMatrix);
      const pe = camera.projectionMatrix.elements;
      grassUniforms.uFx.value = pe[0];
      grassUniforms.uFy.value = pe[5];
      camera.getWorldDirection(_cameraForward);
      grassUniforms.uCameraForward.value.copy(_cameraForward);

      const deltaSq = _deltaXZ.lengthSq();
      if (deltaSq > GRASS_MOVE_EPS_SQ) idleFrames = 0;
      else idleFrames += 1;

      if (
        fieldReady &&
        tileOffsets &&
        lodField.syncLodPartition &&
        deltaSq > GRASS_MOVE_EPS_SQ
      ) {
        wrapGrassTileOffsets(tileOffsets, _deltaXZ.x, _deltaXZ.y);
        const part = partitionGrassLodByOffsets(
          tileOffsets.x,
          tileOffsets.z,
          grassLodRadiusSq(),
        );
        lodField.syncLodPartition(part.nearIndices, part.farIndices);
      }

      const computeAllowed = lodField.root.visible && fieldReady;
      if (import.meta.env.DEV && devSettings.grassPerf.skipCompute) {
        incrementGrassSkippedComputeFrames();
      } else if (computeAllowed) {
        const pass = chooseGrassComputePass(deltaSq, _cameraMatrix, idleFrames);
        if (pass) requestCompute(pass);
      }

      if (import.meta.env.DEV) {
        setGrassComputeQueue(computeInFlight, pendingFull || pendingVisibility);
      }
    },

    getPerfSnapshot() {
      return getGrassPerfSnapshot(Math.floor(GRASS_CONFIG.BLADES_PER_SIDE));
    },

    getLodDrawStats() {
      return lodField.stats;
    },

    onTerrainMapsUpdated() {
      refreshGrassDataMap();
      terrain.applyHeightsToMesh();
      requestCompute('full');
    },

    refreshGrassDataMap,

    dispose() {
      scene.remove(lodField.root);
      lodField.dispose();
      grassDataMap.dispose();
      windAtlas?.dispose();
    },
  };
}
