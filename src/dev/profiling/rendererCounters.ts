// src/dev/profiling/rendererCounters.ts — renderer.info + optional JS heap
import type { WebGPURenderer } from 'three/webgpu';

interface ChromeMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface RendererCounterSample {
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  frameCalls: number;
  computeFrameCalls: number;
  geometries: number;
  textures: number;
  programs: number;
  renderTargets: number;
  gpuMemoryBytes: number;
  jsHeapBytes: number | null;
  jsHeapLimitBytes: number | null;
}

function chromeMemory(): ChromeMemory | null {
  const mem = (performance as Performance & { memory?: ChromeMemory }).memory;
  return mem ?? null;
}

/** Snapshot Three.js frame counters after a render. */
export function sampleRendererCounters(renderer: WebGPURenderer): RendererCounterSample {
  const { render, compute, memory } = renderer.info;
  const heap = chromeMemory();
  return {
    drawCalls: render.drawCalls,
    triangles: render.triangles,
    points: render.points,
    lines: render.lines,
    frameCalls: render.frameCalls,
    computeFrameCalls: compute.frameCalls,
    geometries: memory.geometries,
    textures: memory.textures,
    programs: memory.programs,
    renderTargets: memory.renderTargets,
    gpuMemoryBytes: memory.total,
    jsHeapBytes: heap?.usedJSHeapSize ?? null,
    jsHeapLimitBytes: heap?.jsHeapSizeLimit ?? null,
  };
}

export function bytesToMb(bytes: number | null): number | null {
  if (bytes == null) return null;
  return bytes / (1024 * 1024);
}
