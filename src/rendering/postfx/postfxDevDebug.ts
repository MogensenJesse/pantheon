// src/rendering/postfx/postfxDevDebug.ts — DEV render-debug + GPU weight overrides for post-FX
import type { AaMethod } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { applyRenderDebug, type RenderDebugTargets } from '../../dev/RenderDebugController';

export type GpuDebugTargets = RenderDebugTargets;

export interface PostFxGpuDebugDeps {
  bloomControls: { applyDebugWeight: () => void };
  godraysControls: { applyWeight: () => void };
  gradeControls: { applyDebug: () => void };
  setAaEnabled: (enabled: boolean) => void;
  getAaMethod: () => AaMethod;
  rebuildPipelineOutput: () => void;
  /** Production + DEV hysteresis for god-rays / bloom graph bypass. */
  syncEffectBypass: () => void;
  /**
   * Immediately disconnect effects when DEV disable toggles flip on.
   * @returns true if bypass flags changed (caller should rebuild).
   */
  applyDevEffectBypassFlags: (flags: {
    forceGodraysOff: boolean;
    forceBloomOff: boolean;
  }) => boolean;
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
  let lastPipelineDebugKey = '';

  const pipelineDebugKey = () => {
    const d = devSettings.renderDebug;
    return `${d.disableAa}|${d.disableDof}|${d.disableFsr}|${d.disableBloom}|${d.disableGodRays}|${d.disableShadows}|${deps.getAaMethod()}`;
  };

  const applyGpuDebug = () => {
    const d = devSettings.renderDebug;
    deps.bloomControls.applyDebugWeight();
    deps.gradeControls.applyDebug();
    deps.setAaEnabled(!d.disableAa);
    // Keep sun.castShadow true — GodraysNode samples shadow depth when the pass runs.
    deps.godraysControls.applyWeight();
    deps.syncEffectBypass();
    const pipelineKey = pipelineDebugKey();
    if (pipelineKey !== lastPipelineDebugKey) {
      lastPipelineDebugKey = pipelineKey;
      deps.applyDevEffectBypassFlags({
        forceGodraysOff: d.disableGodRays || d.disableShadows,
        forceBloomOff: d.disableBloom,
      });
      deps.rebuildPipelineOutput();
    }
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
