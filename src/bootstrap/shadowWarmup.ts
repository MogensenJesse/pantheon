// src/bootstrap/shadowWarmup.ts — draw the shadow maps once and compile every pipeline before the first frame

import type { DirectionalLight, PerspectiveCamera, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import {
  warmupCloudCastShadowMap,
  warmupFarSunShadowMap,
  warmupNearCascadeShadowMap,
  warmupWorldCascadeShadowMap,
} from '../rendering/sunShadow';

/** The four shadow maps drawn at the start point, then the scene's pipelines compiled (the village shows one of each mesh meanwhile). */
export async function warmUpShadowsAndPipelines(o: {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  x: number;
  y: number;
  z: number;
  village: { beginWarmup: () => void; endWarmup: () => void } | null;
}): Promise<void> {
  const { renderer, scene, camera, sun, x, y, z } = o;
  warmupFarSunShadowMap(renderer, scene, camera, sun, x, y, z);
  warmupNearCascadeShadowMap(renderer, scene, camera, x, y, z);
  warmupCloudCastShadowMap(renderer, scene, camera, x, y, z);
  warmupWorldCascadeShadowMap(renderer, scene, camera, sun, x, z);
  o.village?.beginWarmup();
  await renderer.compileAsync(scene, camera);
  o.village?.endWarmup();
}
