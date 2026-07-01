// src/rendering/postfx/postfxGpuDebugLog.ts — DEV GPU snapshot hooks (tree-shaken in prod)
import type { WebGPURenderer } from 'three/webgpu';
import type { RenderDebugSettings } from '../../core/GameState';

type GpuDebugLogModule = typeof import('../debug/gpuDebugLog');

export interface PostFxGpuLogHooks {
  maybeLogPeriodic: (renderDebug: RenderDebugSettings) => void;
  logGpuInfo: (renderDebug: RenderDebugSettings) => void;
}

const NOOP_GPU_LOG: PostFxGpuLogHooks = {
  maybeLogPeriodic: () => {},
  logGpuInfo: () => {},
};

/** Prod returns no-ops; DEV prefetches gpuDebugLog as a separate async chunk. */
export function createPostFxGpuLogHooks(renderer: WebGPURenderer): PostFxGpuLogHooks {
  if (!import.meta.env.DEV) {
    return NOOP_GPU_LOG;
  }

  let modPromise: Promise<GpuDebugLogModule> | null = null;
  const load = (): Promise<GpuDebugLogModule> => {
    modPromise ??= import('../debug/gpuDebugLog');
    return modPromise;
  };

  void load();

  return {
    maybeLogPeriodic: (renderDebug) => {
      void load().then((m) => m.maybeLogGpuPeriodic(renderer, renderDebug));
    },
    logGpuInfo: (renderDebug) => {
      void load().then((m) => m.logGpuSnapshot(renderer, renderDebug, true));
    },
  };
}
