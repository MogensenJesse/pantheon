// src/bootstrap/renderStack.ts — the renderer, scene, camera and sun, and the post-processing over them

import { VISUAL } from '../config/visualTuning';
import { initPerformanceSuite } from '../dev/profiling/PerformanceSuite';
import { initPostFX } from '../rendering/PostFX';
import { applyGradeLutToPostFX } from '../rendering/postfx/applyGradeLut';
import { initSceneSetup, type SceneContext } from '../rendering/SceneSetup';
import { createWorldCascadeShadowLight } from '../rendering/sunShadow';
import { getWebGPUErrorMessage } from '../rendering/webgpuCapability';

export interface RenderStack extends SceneContext {
  postFX: ReturnType<typeof initPostFX>;
  /** Resolves once the colour-grade look-up table is loaded (or failed to; the game goes on without it). */
  gradeLutReady: Promise<void>;
  /** DEV only: how the post-processing debug views are wired (null in a build). */
  buildPostFxDebugTargets:
    | typeof import('../dev/runtime/postFxDebugTargets').buildPostFxDebugTargets
    | null;
}

export async function initRenderStack(canvas: HTMLCanvasElement): Promise<RenderStack> {
  let context: SceneContext;
  try {
    context = await initSceneSetup(canvas);
    // Before world materials are built so receivers include the whole-map cascade.
    createWorldCascadeShadowLight(context.scene);
    if (import.meta.env.DEV) initPerformanceSuite(context.renderer);
  } catch (err) {
    console.error('WebGPURenderer init failed:', err);
    document.body.appendChild(getWebGPUErrorMessage());
    throw err;
  }

  const postFX = initPostFX(context.renderer, context.scene, context.camera);
  const buildPostFxDebugTargets = import.meta.env.DEV
    ? (await import('../dev/runtime/postFxDebugTargets')).buildPostFxDebugTargets
    : null;

  const gradeLut = VISUAL.postfx.grade.stops.noon.lut;
  const gradeLutReady =
    gradeLut.enabled && gradeLut.path
      ? applyGradeLutToPostFX(postFX, gradeLut.path, gradeLut.size).catch((err) => {
          console.warn('[grade] Failed to load LUT:', gradeLut.path, err);
        })
      : Promise.resolve();

  return { ...context, postFX, gradeLutReady, buildPostFxDebugTargets };
}
