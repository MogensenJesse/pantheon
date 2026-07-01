// src/rendering/postfx/postfxDevDebug.ts — DEV render-debug + GPU weight overrides for post-FX
import { devSettings } from '../../core/GameState';
import { applyRenderDebug, type RenderDebugTargets } from '../../dev/RenderDebugController';

export type GpuDebugTargets = RenderDebugTargets;

export interface PostFxGpuDebugDeps {
  bloomControls: { applyDebugWeight: () => void };
  godraysControls: { applyWeight: () => void };
  gradeControls: { applyDebug: () => void };
  setAa: (enabled: boolean) => void;
  syncDofOutput: () => void;
}

export interface PostFxGpuDebugContext {
  applyGpuDebug: () => void;
  setDebugTargets: (targets: GpuDebugTargets) => void;
}

/** DEV-only: sync post-FX weights + scene visibility from render-debug toggles. */
export function createPostFxGpuDebug(deps: PostFxGpuDebugDeps): PostFxGpuDebugContext {
  if (!import.meta.env.DEV) {
    return {
      applyGpuDebug: () => {},
      setDebugTargets: () => {},
    };
  }

  let debugTargets: GpuDebugTargets | null = null;

  const applyGpuDebug = () => {
    const d = devSettings.renderDebug;
    deps.bloomControls.applyDebugWeight();
    deps.gradeControls.applyDebug();
    deps.setAa(!d.disableAa);
    // Keep sun.castShadow true — GodraysNode samples shadow depth when the pass runs.
    deps.godraysControls.applyWeight();
    deps.syncDofOutput();
    applyRenderDebug(debugTargets, d);
  };

  return {
    applyGpuDebug,
    setDebugTargets: (targets) => {
      debugTargets = targets;
      applyGpuDebug();
    },
  };
}
