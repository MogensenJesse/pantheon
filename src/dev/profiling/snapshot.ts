// src/dev/profiling/snapshot.ts — JSON export of a profiler sample
import type { RenderDebugSettings } from '../../core/GameState';
import type { CpuSectionSample } from './cpuSectionProfiler';
import type { GpuAdapterSnapshot } from './gpuAdapterInfo';
import type { RendererCounterSample } from './rendererCounters';
import type { InspectorPerfReport } from './threeInspector';

export interface PerformanceSnapshot {
  capturedAt: string;
  userAgent: string;
  adapter: GpuAdapterSnapshot;
  frame: {
    fps: number;
    fpsAvg: number;
    fpsP95: number;
    frameMs: number;
    frameMsAvg: number;
    hitchCount: number;
    cpuMs: number;
    gpuRenderMs: number;
    gpuComputeMs: number;
  };
  renderer: RendererCounterSample;
  sections: CpuSectionSample[];
  renderDebug: RenderDebugSettings;
  grass?: {
    allocatedTotal: number;
    allocatedPerRing: number[];
    compactedVisibleTotal: number;
    compactedPerRing: number[];
    estimatedVisibleTotal: number;
    flowerAllocated: number;
    flowerCompactedVisible: number;
    hiddenPerRing: boolean[];
    flowerHidden: boolean;
  };
  /** Per-pass CPU/GPU from Three.js Inspector (null if Inspector is off). */
  inspector: InspectorPerfReport | null;
  notes: string[];
}

export function downloadPerformanceSnapshot(snapshot: PerformanceSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pantheon-perf-${snapshot.capturedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyPerformanceSnapshot(snapshot: PerformanceSnapshot): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    return true;
  } catch {
    return false;
  }
}
