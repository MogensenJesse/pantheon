// src/dev/postFxDebugTargets.ts — build PostFX GPU debug target bundle
import type { DirectionalLight, InstancedMesh, Mesh, Object3D, Scene } from 'three';
import type { WaterMesh } from 'three/addons/objects/WaterMesh.js';
import type { GpuDebugTargets } from '../rendering/PostFX';
import type { SkyBackgroundHandle } from '../rendering/sky/SkySystem';
import type { TerrainSplatMaterial } from '../world/terrain/TerrainSplatMaterial';

export function buildPostFxDebugTargets(opts: {
  scene: Scene;
  terrainMesh: Mesh;
  terrainMaterial: TerrainSplatMaterial;
  water: WaterMesh;
  clouds: Object3D;
  sky: SkyBackgroundHandle;
  mapPropMeshes: InstancedMesh[];
  grassMesh?: Object3D | null;
  sun: DirectionalLight;
}): GpuDebugTargets {
  return {
    scene: opts.scene,
    terrainMesh: opts.terrainMesh,
    water: opts.water,
    clouds: opts.clouds,
    sky: opts.sky,
    mapPropMeshes: opts.mapPropMeshes,
    grassMesh: opts.grassMesh,
    sun: opts.sun,
    terrainUniforms: opts.terrainMaterial.terrainUniforms,
  };
}
