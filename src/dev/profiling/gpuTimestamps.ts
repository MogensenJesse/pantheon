// src/dev/profiling/gpuTimestamps.ts — drain Three.js timestamp-query pools into renderer.info
import type { WebGPURenderer } from 'three/webgpu';
import { asTimestampRenderer } from './webgpuRendererAccess';

let drainInFlight: Promise<void> | null = null;
let drainQueued = false;

/**
 * Resolve pending COMPUTE then RENDER timestamp queries.
 * Must run every DEV frame when `trackTimestamp` is on, or the query pool overflows.
 * Skip when the Three.js Inspector is attached — it drains the same pools.
 */
export function drainGpuTimestamps(renderer: WebGPURenderer): Promise<void> {
  if (!import.meta.env.DEV) return Promise.resolve();
  if (drainInFlight) {
    drainQueued = true;
    return drainInFlight;
  }

  const r = asTimestampRenderer(renderer);
  if (typeof r.resolveTimestampsAsync !== 'function') return Promise.resolve();

  drainInFlight = (async () => {
    try {
      await r.resolveTimestampsAsync!('compute');
      await r.resolveTimestampsAsync!('render');
    } catch (err) {
      console.warn('[Perf] resolveTimestampsAsync failed', err);
    } finally {
      drainInFlight = null;
      if (drainQueued) {
        drainQueued = false;
        void drainGpuTimestamps(renderer);
      }
    }
  })();
  return drainInFlight;
}

export function readGpuTimestamps(renderer: WebGPURenderer): {
  renderMs: number;
  computeMs: number;
} {
  const { render, compute } = renderer.info;
  return {
    renderMs: render.timestamp || 0,
    computeMs: compute.timestamp || 0,
  };
}
