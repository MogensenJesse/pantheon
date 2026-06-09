// src/world/grass/GrassSystem.ts — player-follow biome grass (3 independent LOD rings)
import type { DirectionalLight, PerspectiveCamera, Scene, Texture } from 'three';
import { type Group, Matrix4, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { MapGrassSettings } from '../../map/MapTypes';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { WORLD } from '../WorldConfig';
import { registerFlowerRingUniforms, registerGrassRingUniforms } from './applyGrassDevUniforms';
import { applyMapGrassSettings } from './applyMapGrassSettings';
import { FLOWER_GRASS_RING_END, flowersEnabled, readFlowerLayout } from './flowers/flowerConfig';
import { createFlowerField, type FlowerField } from './flowers/flowerRingField';
import {
  chooseGrassComputePass,
  GRASS_MOVE_EPS_SQ,
  type GrassComputePass,
  resetGrassComputeSchedule,
} from './grassComputeSchedule';
import { GRASS_RING_COUNT, readGrassRingsLayout } from './grassConfig';
import {
  createGrassDataTexture,
  grassDataDensitiesFromUniforms,
  updateGrassDataTexture,
} from './grassDataTexture';
import { formatGrassRingsSummary } from './grassFieldMetrics';
import {
  createGrassRingField,
  createGrassRingFieldGroup,
  type GrassRingField,
} from './grassRingField';
import { GrassSsbo } from './grassSsbo';
import {
  createGrassRingUniforms,
  createGrassSunShadow,
  type GrassSunShadowNode,
  grassSharedUniforms,
} from './grassUniforms';
import { loadFlowerSprite } from './loadFlowerSprite';
import { loadGrassWindAtlas } from './loadGrassWindAtlas';

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
  sunShadow: GrassSunShadowNode,
): GrassRingField {
  const layout = readGrassRingsLayout().rings[ringIndex]!;
  const ringUniforms = createGrassRingUniforms(layout);
  const ssbo = new GrassSsbo(grassDataMap, ringUniforms, layout.instanceCount, windAtlas);
  return createGrassRingField(ringIndex, ssbo, ringUniforms, layout, windAtlas, sunShadow);
}

function createFlowerFieldFromAssets(
  grassDataMap: ReturnType<typeof createGrassDataTexture>,
  sprite: Texture,
  windAtlas: Awaited<ReturnType<typeof loadGrassWindAtlas>>,
  sunShadow: GrassSunShadowNode,
): FlowerField {
  return createFlowerField(grassDataMap, readFlowerLayout(), sprite, windAtlas, sunShadow);
}

function canUseFlowers(sprite: Texture | null): sprite is Texture {
  return flowersEnabled() && sprite !== null;
}

function grassRingAffectsFlowers(ringIndex: number): boolean {
  return ringIndex <= FLOWER_GRASS_RING_END;
}

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
  if (import.meta.env.DEV && windAtlas) {
    console.info('[grass] Using wind noise atlas');
  }
  if (import.meta.env.DEV && flowerSprite) {
    console.info('[grass] Using flower sprite');
  }

  let ringFields: GrassRingField[] = Array.from({ length: GRASS_RING_COUNT }, (_, i) =>
    createRingField(i, grassDataMap, windAtlas, sunShadow),
  );
  let fieldGroup = createGrassRingFieldGroup(ringFields);
  scene.add(fieldGroup.root);
  registerGrassRingUniforms(ringFields.map((f) => f.ringUniforms));

  let flowerField: FlowerField | null = null;
  if (canUseFlowers(flowerSprite)) {
    flowerField = createFlowerFieldFromAssets(grassDataMap, flowerSprite, windAtlas, sunShadow);
    fieldGroup.root.add(flowerField.root);
    registerFlowerRingUniforms(flowerField.ringUniforms);
  }

  if (import.meta.env.DEV) {
    const layout = readGrassRingsLayout();
    console.info(`[grass] ${formatGrassRingsSummary(layout)}`);
  }

  const bootComputeAll = async (fields: GrassRingField[], flower: FlowerField | null = null) => {
    for (const field of fields) {
      await renderer.computeAsync(field.ssbo.computeInit);
      await renderer.computeAsync(field.ssbo.computeUpdate);
    }
    if (flower) {
      await renderer.computeAsync(flower.ssbo.computeInit);
      await renderer.computeAsync(flower.ssbo.computeUpdate);
    }
  };
  await bootComputeAll(ringFields, flowerField);

  _prevPlayer.copy(grassSharedUniforms.uPlayerPosition.value);

  let compileCamera: PerspectiveCamera | null = null;
  let fieldReady = true;
  let computeInFlight = false;
  let pendingFull = false;
  let pendingVisibility = false;
  let idleFrames = 0;
  let grassTask: Promise<void> = Promise.resolve();

  const refreshGrassDataMap = () => {
    mapGrassUniforms.meadowDensity = grassSharedUniforms.uMeadowDensity.value;
    mapGrassUniforms.forestDensity = grassSharedUniforms.uForestDensity.value;
    mapGrassUniforms.hillsDensity = grassSharedUniforms.uHillsDensity.value;
    mapGrassUniforms.shoreDensity = grassSharedUniforms.uShoreDensity.value;
    mapGrassUniforms.mountainDensity = grassSharedUniforms.uMountainDensity.value;
    mapGrassUniforms.pathDensity = grassSharedUniforms.uPathDensity.value;
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

  const replaceFieldGroup = (nextFields: GrassRingField[], nextFlowerField: FlowerField | null) => {
    fieldGroup.dispose();
    if (flowerField) {
      fieldGroup.root.remove(flowerField.root);
      flowerField.dispose();
    }
    scene.remove(fieldGroup.root);
    ringFields = nextFields;
    fieldGroup = createGrassRingFieldGroup(ringFields);
    flowerField = nextFlowerField;
    if (flowerField) {
      fieldGroup.root.add(flowerField.root);
      registerFlowerRingUniforms(flowerField.ringUniforms);
    } else {
      registerFlowerRingUniforms(null);
    }
    scene.add(fieldGroup.root);
    registerGrassRingUniforms(ringFields.map((f) => f.ringUniforms));
    options.onMeshReplaced?.(fieldGroup.root);
  };

  const createFlowerFieldIfEnabled = (): FlowerField | null => {
    if (!canUseFlowers(flowerSprite)) return null;
    return createFlowerFieldFromAssets(grassDataMap, flowerSprite, windAtlas, sunShadow);
  };

  const runSsboPassSync = async (passKind: GrassComputePass) => {
    const grassNodes = ringFields.map((field) =>
      passKind === 'full' ? field.ssbo.computeUpdate : field.ssbo.computeVisibility,
    );
    const flowerNode =
      flowersEnabled() && flowerField
        ? passKind === 'full'
          ? flowerField.ssbo.computeUpdate
          : flowerField.ssbo.computeVisibility
        : null;
    await Promise.all(
      [...grassNodes, ...(flowerNode ? [flowerNode] : [])].map((node) =>
        renderer.computeAsync(node),
      ),
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
    if (flowerField) flowerField.mesh.count = 0;

    refreshGrassDataMap();
    const nextFields = Array.from({ length: GRASS_RING_COUNT }, (_, i) =>
      createRingField(i, grassDataMap, windAtlas, sunShadow),
    );
    const nextFlowerField = createFlowerFieldIfEnabled();
    await bootComputeAll(nextFields, nextFlowerField);
    replaceFieldGroup(nextFields, nextFlowerField);

    fieldReady = true;
    resetGrassComputeSchedule();
    await compileGrass();
  };

  const rebuildSingleRingOnce = async (ringIndex: number) => {
    fieldReady = false;
    ringFields[ringIndex]!.mesh.count = 0;

    refreshGrassDataMap();
    const nextField = createRingField(ringIndex, grassDataMap, windAtlas, sunShadow);
    await renderer.computeAsync(nextField.ssbo.computeInit);
    await renderer.computeAsync(nextField.ssbo.computeUpdate);

    const nextFields = ringFields.slice();
    nextFields[ringIndex] = nextField;

    let nextFlowerField = flowerField;
    if (grassRingAffectsFlowers(ringIndex) && canUseFlowers(flowerSprite)) {
      if (flowerField) flowerField.mesh.count = 0;
      nextFlowerField = createFlowerFieldIfEnabled();
      if (nextFlowerField) {
        await renderer.computeAsync(nextFlowerField.ssbo.computeInit);
        await renderer.computeAsync(nextFlowerField.ssbo.computeUpdate);
      }
    }

    replaceFieldGroup(nextFields, nextFlowerField);

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
        if (flowerField) {
          await renderer.computeAsync(flowerField.ssbo.computeInit);
        }
      }),

    rebuildField: () => enqueueGrassTask(rebuildAllRingsOnce),

    rebuildRing: (ringIndex: number) =>
      enqueueGrassTask(async () => {
        if (ringIndex < 0 || ringIndex >= GRASS_RING_COUNT) return;
        await rebuildSingleRingOnce(ringIndex);
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

      const deltaSq = grassSharedUniforms.uPlayerDeltaXZ.value.lengthSq();
      if (deltaSq > GRASS_MOVE_EPS_SQ) idleFrames = 0;
      else idleFrames += 1;

      const computeAllowed = fieldGroup.root.visible && fieldReady;
      if (computeAllowed) {
        const pass = chooseGrassComputePass(deltaSq, _cameraMatrix, idleFrames);
        if (pass) requestCompute(pass);
      }

      fieldGroup.setPosition(playerPosition.x, 0, playerPosition.z);
      if (flowerField) {
        flowerField.root.position.set(playerPosition.x, 0, playerPosition.z);
        flowerField.setVisible(flowersEnabled() && fieldGroup.root.visible);
      }
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
      if (flowerField) {
        fieldGroup.root.remove(flowerField.root);
        flowerField.dispose();
        flowerField = null;
      }
      fieldGroup.dispose();
      grassDataMap.dispose();
      windAtlas?.dispose();
      flowerSprite?.dispose();
    },
  };
}
