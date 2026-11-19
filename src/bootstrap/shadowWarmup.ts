// src/bootstrap/shadowWarmup.ts — draw the shadow maps once and compile every pipeline before the first frame

import type { DirectionalLight, InstancedMesh, PerspectiveCamera, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import {
  warmupCloudCastShadowMap,
  warmupFarSunShadowMap,
  warmupNearCascadeShadowMap,
  warmupWorldCascadeShadowMap,
} from '../rendering/sunShadow';

/**
 * Lets `compileAsync` see what it would skip: objects out of the camera's frustum, and prop LOD tiers that are
 * switched off (hidden, no instances). Without this a tier or a far prop compiles its shaders when the camera first
 * gets near it, which is a freeze in play. Returns the undo.
 */
function showEverythingForCompile(scene: Scene): () => void {
  const undo: (() => void)[] = [];
  scene.traverse((object) => {
    if (object.frustumCulled) {
      object.frustumCulled = false;
      undo.push(() => {
        object.frustumCulled = true;
      });
    }
    const tier = object as InstancedMesh;
    if (tier.isInstancedMesh && !tier.visible && tier.count === 0 && tier.parent?.visible) {
      tier.visible = true;
      tier.count = 1;
      undo.push(() => {
        tier.visible = false;
        tier.count = 0;
      });
    }
  });
  return () => {
    for (const restore of undo) restore();
  };
}

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
  const restore = showEverythingForCompile(scene);
  try {
    await renderer.compileAsync(scene, camera);
  } finally {
    restore();
  }
  o.village?.endWarmup();
}
