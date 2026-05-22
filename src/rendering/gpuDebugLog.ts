// src/rendering/gpuDebugLog.ts — DEV renderer.info snapshots for GPU profiling
import type { WebGPURenderer } from 'three/webgpu';
import type { RenderDebugSettings } from '../core/GameState';

let lastLogMs = 0;
const LOG_INTERVAL_MS = 3000;

export function logGpuSnapshot(
  renderer: WebGPURenderer,
  renderDebug: RenderDebugSettings,
  force = false,
): void {
  if (!import.meta.env.DEV) return;
  const now = performance.now();
  if (!force && now - lastLogMs < LOG_INTERVAL_MS) return;
  lastLogMs = now;

  const { render, memory } = renderer.info;
  console.info('[GpuDebug] snapshot (current frame counters)', {
    render: {
      frameCalls: render.frameCalls,
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      points: render.points,
      lines: render.lines,
    },
    memory: {
      geometries: memory.geometries,
      textures: memory.textures,
    },
    flags: { ...renderDebug },
    note: 'Log right after a frame renders; `calls` is session-cumulative and omitted.',
  });
}

export function maybeLogGpuPeriodic(
  renderer: WebGPURenderer,
  renderDebug: RenderDebugSettings,
): void {
  if (!import.meta.env.DEV || !renderDebug.logGpuPeriodic) return;
  logGpuSnapshot(renderer, renderDebug, false);
}
