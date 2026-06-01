// src/world/grass/GrassSystem.ts — player-follow biome grass field
import type { InstancedMesh, PerspectiveCamera, Scene } from 'three';
import { InstancedMesh as InstancedMeshImpl, Matrix4, Vector2, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { WORLD } from '../WorldConfig';
import type { MapTerrainContext } from '../MapTerrainBuilder';
import { createGrassBladeGeometry } from './grassGeometry';
import { createGrassHeightTexture, updateGrassHeightTexture } from './grassHeightTexture';
import { createGrassMaterial } from './grassMaterial';
import { grassInstanceCount } from './grassConfig';
import { GrassSsbo } from './grassSsbo';
import { grassUniforms } from './grassUniforms';

export interface GrassUpdateParams {
  playerPosition: Vector3;
  playerRadius: number;
  camera: PerspectiveCamera;
  elapsed: number;
  sunIntensity: number;
}

export interface GrassSystem {
  mesh: InstancedMesh;
  update: (params: GrassUpdateParams) => void;
  /** Re-roll per-blade scale from current min/max uniforms (dev panel). */
  reinitInstances: () => Promise<void>;
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
): Promise<GrassSystem> {
  grassUniforms.uWorldSize.value = WORLD.SIZE;
  grassUniforms.uHeightScale.value = WORLD.HEIGHT_SCALE;

  const heightMap = createGrassHeightTexture(terrain.grids);
  const ssbo = new GrassSsbo(terrain.biomeMap, terrain.pathMap, heightMap);
  await renderer.computeAsync(ssbo.computeInit);
  await renderer.computeAsync(ssbo.computeUpdate);

  const geometry = createGrassBladeGeometry();
  const material = createGrassMaterial(ssbo);
  const mesh = new InstancedMeshImpl(geometry, material, grassInstanceCount());
  mesh.frustumCulled = false;
  mesh.name = 'grassField';
  scene.add(mesh);

  _prevPlayer.copy(grassUniforms.uPlayerPosition.value);

  let computeInFlight = false;
  let computeEvery = 0;

  const runCompute = () => {
    if (computeInFlight) return;
    computeInFlight = true;
    renderer
      .computeAsync(ssbo.computeUpdate)
      .catch((err) => {
        console.error('[grass] computeAsync failed:', err);
      })
      .finally(() => {
        computeInFlight = false;
      });
  };

  return {
    mesh,

    reinitInstances: () => renderer.computeAsync(ssbo.computeInit),

    update(params) {
      const { playerPosition, playerRadius, camera, elapsed, sunIntensity } = params;

      mesh.position.set(playerPosition.x, 0, playerPosition.z);

      computeEvery += 1;
      if (computeEvery % 2 !== 0) return;

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
      grassUniforms.uFx.value = camera.projectionMatrix.elements[0];
      grassUniforms.uFy.value = camera.projectionMatrix.elements[5];
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
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      heightMap.dispose();
    },
  };
}
