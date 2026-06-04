// src/world/grass/GrassSystem.ts — player-follow biome grass (3 independent LOD rings)
import type { PerspectiveCamera, Scene } from 'three';
import { Group, Matrix4, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { MapGrassSettings } from '../../map/MapTypes';
import { WORLD } from '../WorldConfig';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { applyMapGrassSettings } from './applyMapGrassSettings';
import { GRASS_RING_COUNT, readGrassRingsLayout } from './grassConfig';
import { GrassSsbo } from './grassSsbo';
import { grassSharedUniforms, createGrassRingUniforms } from './grassUniforms';
import { loadGrassWindAtlas } from './loadGrassWindAtlas';
import {
  chooseGrassComputePass,
  GRASS_MOVE_EPS_SQ,
  resetGrassComputeSchedule,
  type GrassComputePass,
} from './grassComputeSchedule';
import {
  createGrassDataTexture,
  grassDataDensitiesFromUniforms,
  updateGrassDataTexture,
} from './grassDataTexture';
import {
  createGrassRingField,
  createGrassRingFieldGroup,
  type GrassRingField,
} from './grassRingField';
import { formatGrassRingsSummary } from './grassFieldMetrics';
import { registerGrassRingUniforms } from './applyGrassDevUniforms';

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
  mesh: Group;
  update: (params: GrassUpdateParams) => void;
  reinitInstances: () => Promise<void>;
  rebuildField: () => Promise<void>;
  rebuildRing: (ringIndex: number) => Promise<void>;
  onTerrainMapsUpdated: () => void;
  refreshGrassDataMap: () => void;
  dispose: () => void;
}

const _prevPlayer = new Vector3();
const _cameraMatrix = new Matrix4();
const _cameraForward = new Vector3();

function createRingField(
  ringIndex: number,
  grassDataMap: ReturnType<typeof createGrassDataTexture>,
  windAtlas: Awaited<ReturnType<typeof loadGrassWindAtlas>>,
): GrassRingField {
  const layout = readGrassRingsLayout().rings[ringIndex]!;
  const ringUniforms = createGrassRingUniforms(layout);
  const ssbo = new GrassSsbo(grassDataMap, ringUniforms, layout.instanceCount, windAtlas);
  return createGrassRingField(ringIndex, ssbo, ringUniforms, layout, windAtlas);
}

export async function initGrassSystem(
  scene: Scene,
  renderer: WebGPURenderer,
  terrain: MapTerrainContext,
  options?: GrassSystemInitOptions,
): Promise<GrassSystem> {
  grassSharedUniforms.uWorldSize.value = WORLD.SIZE;
  grassSharedUniforms.uHeightScale.value = WORLD.HEIGHT_SCALE;
  const mapGrassUniforms = applyMapGrassSettings(options?.mapGrass);
  const grassDataDensities = () =>
    grassDataDensitiesFromUniforms(mapGrassUniforms, grassSharedUniforms.uBiomeGrassThreshold.value);
  let grassDataMap = createGrassDataTexture(terrain.grids, grassDataDensities());
  const windAtlas = await loadGrassWindAtlas();
  if (import.meta.env.DEV && windAtlas) {
    console.info('[grass] Using wind noise atlas');
  }

  let ringFields: GrassRingField[] = Array.from({ length: GRASS_RING_COUNT }, (_, i) =>
    createRingField(i, grassDataMap, windAtlas),
  );
  let fieldGroup = createGrassRingFieldGroup(ringFields);
  scene.add(fieldGroup.root);
  registerGrassRingUniforms(ringFields.map((f) => f.ringUniforms));

  if (import.meta.env.DEV) {
    const layout = readGrassRingsLayout();
    console.info(`[grass] ${formatGrassRingsSummary(layout)}`);
  }

  const bootComputeAll = async (fields: GrassRingField[]) => {
    for (const field of fields) {
      await renderer.computeAsync(field.ssbo.computeInit);
      await renderer.computeAsync(field.ssbo.computeUpdate);
    }
  };
  await bootComputeAll(ringFields);

  _prevPlayer.copy(grassSharedUniforms.uPlayerPosition.value);

  let compileCamera: PerspectiveCamera | null = null;
  let fieldReady = true;
  let computeInFlight = false;
  let pendingFull = false;
  let pendingVisibility = false;
  let idleFrames = 0;
  let grassTask: Promise<void> = Promise.resolve();

  const refreshGrassDataMap = () => {
    mapGrassUniforms.forestDensity = grassSharedUniforms.uForestDensity.value;
    mapGrassUniforms.hillsDensity = grassSharedUniforms.uHillsDensity.value;
    mapGrassUniforms.shoreDensity = grassSharedUniforms.uShoreDensity.value;
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

  const replaceFieldGroup = (nextFields: GrassRingField[]) => {
    fieldGroup.dispose();
    scene.remove(fieldGroup.root);
    ringFields = nextFields;
    fieldGroup = createGrassRingFieldGroup(ringFields);
    scene.add(fieldGroup.root);
    registerGrassRingUniforms(ringFields.map((f) => f.ringUniforms));
    options?.onMeshReplaced?.(fieldGroup.root);
  };

  const runSsboPassSync = async (passKind: GrassComputePass) => {
    await Promise.all(
      ringFields.map((field) => {
        const node = passKind === 'full' ? field.ssbo.computeUpdate : field.ssbo.computeVisibility;
        return renderer.computeAsync(node);
      }),
    );
  };

  const runPassAsync = async (passKind: GrassComputePass) => {
    try {
      await runSsboPassSync(passKind);
    } catch (err) {
      console.error('[grass] compute failed:', err);
    }
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
        await runPassAsync(passKind);
      }
    };
    void drain().finally(() => {
      computeInFlight = false;
      if (pendingFull || pendingVisibility) requestCompute(pendingFull ? 'full' : 'visibility');
    });
  };

  const rebuildAllRingsOnce = async () => {
    fieldReady = false;
    for (const field of ringFields) field.mesh.count = 0;

    refreshGrassDataMap();
    const nextFields = Array.from({ length: GRASS_RING_COUNT }, (_, i) =>
      createRingField(i, grassDataMap, windAtlas),
    );
    await bootComputeAll(nextFields);
    replaceFieldGroup(nextFields);

    fieldReady = true;
    resetGrassComputeSchedule();
    await compileGrass();
  };

  const rebuildSingleRingOnce = async (ringIndex: number) => {
    fieldReady = false;
    ringFields[ringIndex]!.mesh.count = 0;

    refreshGrassDataMap();
    const nextField = createRingField(ringIndex, grassDataMap, windAtlas);
    await renderer.computeAsync(nextField.ssbo.computeInit);
    await renderer.computeAsync(nextField.ssbo.computeUpdate);

    const nextFields = ringFields.slice();
    nextFields[ringIndex] = nextField;
    replaceFieldGroup(nextFields);

    fieldReady = true;
    resetGrassComputeSchedule();
    await compileGrass();
  };

  return {
    get mesh() {
      return fieldGroup.root;
    },

    reinitInstances: () =>
      enqueueGrassTask(async () => {
        if (!fieldReady) return;
        for (const field of ringFields) {
          await renderer.computeAsync(field.ssbo.computeInit);
        }
      }),

    rebuildField: () => enqueueGrassTask(rebuildAllRingsOnce),

    rebuildRing: (ringIndex: number) =>
      enqueueGrassTask(async () => {
        if (ringIndex < 0 || ringIndex >= GRASS_RING_COUNT) return;
        await rebuildSingleRingOnce(ringIndex);
      }),

    update(params) {
      const { playerPosition, playerRadius, camera, elapsed, sunIntensity } = params;
      compileCamera = camera;

      grassSharedUniforms.uPlayerDeltaXZ.value.set(
        playerPosition.x - _prevPlayer.x,
        playerPosition.z - _prevPlayer.z,
      );
      grassSharedUniforms.uPlayerPosition.value.copy(playerPosition);
      grassSharedUniforms.uPlayerRadius.value = playerRadius;
      grassSharedUniforms.uTime.value = elapsed;
      grassSharedUniforms.uSunIntensity.value = sunIntensity;

      camera.updateMatrixWorld();
      _cameraMatrix.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      grassSharedUniforms.uCameraMatrix.value.copy(_cameraMatrix);
      const pe = camera.projectionMatrix.elements;
      grassSharedUniforms.uFx.value = pe[0];
      grassSharedUniforms.uFy.value = pe[5];
      camera.getWorldDirection(_cameraForward);
      grassSharedUniforms.uCameraForward.value.copy(_cameraForward);

      const deltaSq = grassSharedUniforms.uPlayerDeltaXZ.value.lengthSq();
      if (deltaSq > GRASS_MOVE_EPS_SQ) idleFrames = 0;
      else idleFrames += 1;

      const computeAllowed = fieldGroup.root.visible && fieldReady;
      if (computeAllowed) {
        const pass = chooseGrassComputePass(deltaSq, _cameraMatrix, idleFrames);
        if (pass) requestCompute(pass);
      }

      fieldGroup.setPosition(playerPosition.x, 0, playerPosition.z);
      _prevPlayer.copy(playerPosition);
    },

    onTerrainMapsUpdated() {
      refreshGrassDataMap();
      terrain.applyHeightsToMesh();
      requestCompute('full');
    },

    refreshGrassDataMap,

    dispose() {
      scene.remove(fieldGroup.root);
      fieldGroup.dispose();
      grassDataMap.dispose();
      windAtlas?.dispose();
    },
  };
}
