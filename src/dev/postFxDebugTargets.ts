// src/dev/postFxDebugTargets.ts — build PostFX GPU debug target bundle
import type { DirectionalLight, Mesh, Object3D, Scene } from 'three';
import type { WaterMesh } from 'three/addons/objects/WaterMesh.js';
import type { GpuDebugTargets } from '../rendering/PostFX';
import type { SkyBackgroundHandle } from '../rendering/sky/SkySystem';
import type { AssetScatterer } from '../world/AssetScatterer';
import type { TerrainSplatMaterial } from '../world/terrain/TerrainSplatMaterial';

export function buildPostFxDebugTargets(opts: {
  scene: Scene;
  terrainMesh: Mesh;
  terrainMaterial: TerrainSplatMaterial;
  water: WaterMesh;
  clouds: Object3D;
  sky: SkyBackgroundHandle;
  scatterer: AssetScatterer;
  sun: DirectionalLight;
}): GpuDebugTargets {
  return {
    scene: opts.scene,
    terrainMesh: opts.terrainMesh,
    water: opts.water,
    clouds: opts.clouds,
    sky: opts.sky,
    scatterMeshes: opts.scatterer.getDebugMeshes(),
    sun: opts.sun,
    terrainUniforms: opts.terrainMaterial.terrainUniforms,
  };
}
