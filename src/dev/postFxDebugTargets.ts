// src/dev/postFxDebugTargets.ts — build PostFX GPU debug target bundle
import type { DirectionalLight, Mesh, Object3D, Scene } from 'three';
import type { SkyBackgroundHandle } from '../rendering/SkySystem';
import type { GpuDebugTargets } from '../rendering/PostFX';
import type { AssetScatterer } from '../world/AssetScatterer';

export function buildPostFxDebugTargets(opts: {
  scene: Scene;
  terrainMesh: Mesh;
  water: Object3D;
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
  };
}
