// src/world/grass/GrassSystem.ts — player-follow biome grass field
import type { InstancedMesh, PerspectiveCamera, Scene } from 'three';
import { InstancedMesh as InstancedMeshImpl, Matrix4, Vector2, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { MapGrassSettings } from '../../map/MapTypes';
import { WORLD } from '../WorldConfig';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { applyMapGrassSettings } from './applyMapGrassSettings';
import { createGrassBladeGeometry } from './grassGeometry';
import { createGrassHeightTexture, updateGrassHeightTexture } from './grassHeightTexture';
import { createGrassMaterial } from './grassMaterial';
import { grassInstanceCount } from './grassConfig';
import { GrassSsbo } from './grassSsbo';
import { grassUniforms } from './grassUniforms';
import { loadGrassWindAtlas } from './loadGrassWindAtlas';

export interface GrassUpdateParams {
  playerPosition: Vector3;
  playerRadius: number;
  camera: PerspectiveCamera;
  elapsed: number;
  sunIntensity: number;
}

export interface GrassSystemInitOptions {
  mapGrass?: MapGrassSettings;
  onMeshReplaced?: (mesh: InstancedMesh) => void;
}

export interface GrassSystem {
  mesh: InstancedMesh;
  update: (params: GrassUpdateParams) => void;
  reinitInstances: () => Promise<void>;
  rebuildField: () => Promise<void>;
  onTerrainMapsUpdated: () => void;
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
  applyMapGrassSettings(options?.mapGrass);

  const heightMap = createGrassHeightTexture(terrain.grids);
  const windAtlas = await loadGrassWindAtlas();
  if (import.meta.env.DEV && windAtlas) {
    console.info('[grass] Using wind noise atlas');
  }

  const materialMaps = { biomeMap: terrain.biomeMap, pathMap: terrain.pathMap };

  const initialCount = grassInstanceCount();
  let ssbo = new GrassSsbo(
    terrain.biomeMap,
    terrain.pathMap,
    heightMap,
    initialCount,
    windAtlas,
  );
  let geometry = createGrassBladeGeometry();
  let material = createGrassMaterial(ssbo, { ...materialMaps, heightMap });

  const bootCompute = async (target: GrassSsbo) => {
    await renderer.computeAsync(target.computeInit);
    await renderer.computeAsync(target.computeUpdate);
  };
  await bootCompute(ssbo);

  const meshRoot = {
    mesh: new InstancedMeshImpl(geometry, material, initialCount) as InstancedMesh,
  };
  meshRoot.mesh.frustumCulled = false;
  meshRoot.mesh.name = 'grassField';
  scene.add(meshRoot.mesh);

  _prevPlayer.copy(grassUniforms.uPlayerPosition.value);

  let compileCamera: PerspectiveCamera | null = null;
  let fieldReady = true;
  let computeInFlight = false;
  let computePending = false;
  let grassTask: Promise<void> = Promise.resolve();

  const enqueueGrassTask = (task: () => Promise<void>): Promise<void> => {
    const run = grassTask.then(task, task);
    grassTask = run.catch(() => {});
    return run;
  };

  const compileGrass = async () => {
    if (!compileCamera) return;
    await renderer.compileAsync(scene, compileCamera);
  };

  const replaceInstancedMesh = async (
    nextGeometry: typeof geometry,
    nextMaterial: typeof material,
    instanceCount: number,
  ) => {
    const prev = meshRoot.mesh;
    const next = new InstancedMeshImpl(nextGeometry, nextMaterial, instanceCount);
    next.frustumCulled = false;
    next.name = 'grassField';
    next.visible = prev.visible;
    next.position.copy(prev.position);

    scene.remove(prev);
    prev.geometry.dispose();
    (prev.material as typeof material).dispose();
    scene.add(next);
    meshRoot.mesh = next;
    options?.onMeshReplaced?.(next);
    await compileGrass();
  };

  const runCompute = () => {
    if (!fieldReady) return;
    computePending = true;
    if (computeInFlight) return;
    computeInFlight = true;
    const drain = async () => {
      while (computePending) {
        computePending = false;
        try {
          await renderer.computeAsync(ssbo.computeUpdate);
        } catch (err) {
          console.error('[grass] computeAsync failed:', err);
          break;
        }
      }
    };
    void drain().finally(() => {
      computeInFlight = false;
      if (computePending) runCompute();
    });
  };

  const rebuildFieldOnce = async () => {
    const instanceCount = grassInstanceCount();
    fieldReady = false;
    meshRoot.mesh.count = 0;

    geometry.dispose();
    material.dispose();

    const newSsbo = new GrassSsbo(
      terrain.biomeMap,
      terrain.pathMap,
      heightMap,
      instanceCount,
      windAtlas,
    );
    await bootCompute(newSsbo);

    ssbo = newSsbo;
    geometry = createGrassBladeGeometry();
    material = createGrassMaterial(ssbo, { ...materialMaps, heightMap });

    const meshCapacity = meshRoot.mesh.instanceMatrix.count;
    if (instanceCount <= meshCapacity) {
      meshRoot.mesh.geometry = geometry;
      meshRoot.mesh.material = material;
      meshRoot.mesh.count = instanceCount;
      await compileGrass();
    } else {
      await replaceInstancedMesh(geometry, material, instanceCount);
    }

    fieldReady = true;
  };

  return {
    get mesh() {
      return meshRoot.mesh;
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

      meshRoot.mesh.position.set(playerPosition.x, 0, playerPosition.z);

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
      camera.getWorldDirection(_cameraForward);
      grassUniforms.uCameraForward.value.copy(_cameraForward);

      runCompute();
    },

    onTerrainMapsUpdated() {
      updateGrassHeightTexture(heightMap, terrain.grids);
      terrain.applyHeightsToMesh();
      runCompute();
    },

    dispose() {
      scene.remove(meshRoot.mesh);
      geometry.dispose();
      material.dispose();
      heightMap.dispose();
      windAtlas?.dispose();
    },
  };
}
