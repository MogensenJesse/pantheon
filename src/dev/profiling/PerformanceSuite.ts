// src/dev/profiling/PerformanceSuite.ts — DEV WebGPU/TSL profiling orchestrator

import type { WebGPURenderer } from 'three/webgpu';
import { devDebugSettings } from '../../core/GameState';
import type { GrassSystem } from '../../world/grass/core/GrassSystem';
import {
  beginCpuFrame,
  endCpuFrame,
  getCpuFrameTotalMs,
  getLastCpuSections,
  markCpuSection,
} from './cpuSectionProfiler';
import { getFrameStats, pushFrameSample, resetFrameStats } from './frameStats';
import { formatAdapterLabel, sampleGpuAdapter } from './gpuAdapterInfo';
import { drainGpuTimestamps, readGpuTimestamps } from './gpuTimestamps';
import {
  disposeOverlay,
  isOverlayMounted,
  overlayBeginFrame,
  overlayEndFrame,
  setOverlayVisible,
  updateOverlay,
} from './overlay';
import { bytesToMb, sampleRendererCounters } from './rendererCounters';
import {
  copyPerformanceSnapshot,
  downloadPerformanceSnapshot,
  type PerformanceSnapshot,
} from './snapshot';
import {
  disposeThreeInspector,
  type InspectorPerfReport,
  isInspectorAttached,
  logInspectorReport,
  sampleInspectorReport,
  setThreeInspectorEnabled,
} from './threeInspector';

export interface PerfHudModel {
  fps: number;
  fpsAvg: number;
  fpsP95: number;
  frameMs: number;
  hitchCount: number;
  cpuMs: number;
  gpuRenderMs: number;
  gpuComputeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  gpuMemoryMb: number | null;
  jsHeapMb: number | null;
  adapter: string;
  backend: string;
  timestampQuery: boolean;
  sections: Array<{ name: string; ms: number }>;
  grassAllocated: number;
  grassCompacted: number;
  grassCompactedPerRing: number[];
}

const EMPTY_HUD: PerfHudModel = {
  fps: 0,
  fpsAvg: 0,
  fpsP95: 0,
  frameMs: 0,
  hitchCount: 0,
  cpuMs: 0,
  gpuRenderMs: 0,
  gpuComputeMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  gpuMemoryMb: null,
  jsHeapMb: null,
  adapter: '—',
  backend: '—',
  timestampQuery: false,
  sections: [],
  grassAllocated: 0,
  grassCompacted: 0,
  grassCompactedPerRing: [],
};

let rendererRef: WebGPURenderer | null = null;
let grassRef: GrassSystem | undefined;
let lastHud: PerfHudModel = EMPTY_HUD;

function installConsoleHook(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  window.__pantheonPerf = {
    snapshot: capturePerformanceSnapshot,
    logDevice: logGpuDevice,
    exportSnapshot: exportPerformanceSnapshot,
    overlay: setPerformanceOverlayEnabled,
    inspector: setThreeInspectorVisible,
    inspectorReport: () => {
      const report = sampleInspectorReport();
      logInspectorReport(report);
      return report;
    },
  };
}

/** Bind the live renderer. Call once after `renderer.init()`. */
export function initPerformanceSuite(renderer: WebGPURenderer): void {
  if (!import.meta.env.DEV) return;
  rendererRef = renderer;
  installConsoleHook();
  if (devDebugSettings.showFpsCounter) {
    void setOverlayVisible(renderer, true);
  }
  if (devDebugSettings.showThreeInspector) {
    void setThreeInspectorEnabled(renderer, true);
  }
}

export function setPerformanceGrassSource(grass: GrassSystem | undefined): void {
  grassRef = grass;
}

export function setPerformanceOverlayEnabled(enabled: boolean): void {
  if (!import.meta.env.DEV) return;
  devDebugSettings.showFpsCounter = enabled;
  if (!rendererRef) return;
  void setOverlayVisible(rendererRef, enabled);
}

export function setThreeInspectorVisible(enabled: boolean): void {
  if (!import.meta.env.DEV) return;
  devDebugSettings.showThreeInspector = enabled;
  if (!rendererRef) return;
  void setThreeInspectorEnabled(rendererRef, enabled);
}

export function beginPerformanceFrame(): void {
  if (!import.meta.env.DEV) return;
  overlayBeginFrame();
  beginCpuFrame();
}

export function markPerformanceSection(name: string): void {
  if (!import.meta.env.DEV) return;
  markCpuSection(name);
}

export function endPerformanceFrame(renderer: WebGPURenderer): void {
  if (!import.meta.env.DEV) return;
  endCpuFrame();
  pushFrameSample();
  if (!isInspectorAttached()) {
    void drainGpuTimestamps(renderer);
  }
  const counters = sampleRendererCounters(renderer);
  const gpu = readGpuTimestamps(renderer);
  const frame = getFrameStats();
  const adapter = sampleGpuAdapter(renderer);
  const grassStats = grassRef?.getBladeStats();
  lastHud = {
    fps: frame.fps,
    fpsAvg: frame.fpsAvg,
    fpsP95: frame.fpsP95,
    frameMs: frame.frameMs,
    hitchCount: frame.hitchCount,
    cpuMs: getCpuFrameTotalMs(),
    gpuRenderMs: gpu.renderMs,
    gpuComputeMs: gpu.computeMs,
    drawCalls: counters.drawCalls,
    triangles: counters.triangles,
    geometries: counters.geometries,
    textures: counters.textures,
    gpuMemoryMb: bytesToMb(counters.gpuMemoryBytes),
    jsHeapMb: bytesToMb(counters.jsHeapBytes),
    adapter: formatAdapterLabel(adapter),
    backend: adapter.backend,
    timestampQuery: adapter.timestampQuery,
    sections: getLastCpuSections().map((s) => ({ name: s.name, ms: s.ms })),
    grassAllocated: grassStats?.allocatedTotal ?? 0,
    grassCompacted: grassStats?.compactedVisibleTotal ?? 0,
    grassCompactedPerRing: grassStats?.rings.map((r) => r.compactedVisible) ?? [],
  };
  if (isOverlayMounted() || devDebugSettings.showFpsCounter) {
    overlayEndFrame();
    updateOverlay(counters);
  }
}

export function getPerfHud(): PerfHudModel {
  return lastHud;
}

export function capturePerformanceSnapshot(): PerformanceSnapshot {
  if (!rendererRef) {
    throw new Error('Performance suite is not bound to a renderer');
  }
  const counters = sampleRendererCounters(rendererRef);
  const gpu = readGpuTimestamps(rendererRef);
  const frame = getFrameStats();
  const adapter = sampleGpuAdapter(rendererRef);
  const grass = grassRef?.getBladeStats();
  return {
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    adapter,
    frame: {
      fps: frame.fps,
      fpsAvg: frame.fpsAvg,
      fpsP95: frame.fpsP95,
      frameMs: frame.frameMs,
      frameMsAvg: frame.frameMsAvg,
      hitchCount: frame.hitchCount,
      cpuMs: getCpuFrameTotalMs(),
      gpuRenderMs: gpu.renderMs,
      gpuComputeMs: gpu.computeMs,
    },
    renderer: counters,
    sections: [...getLastCpuSections()],
    renderDebug: { ...devDebugSettings.renderDebug },
    grass: grass
      ? {
          allocatedTotal: grass.allocatedTotal,
          allocatedPerRing: grass.rings.map((r) => r.instanceCount),
          compactedVisibleTotal: grass.compactedVisibleTotal,
          compactedPerRing: grass.rings.map((r) => r.compactedVisible),
          estimatedVisibleTotal: grass.estimatedVisibleTotal,
          flowerAllocated: grass.flowerAllocated,
          flowerCompactedVisible: grass.flowerCompactedVisible,
          hiddenPerRing: [
            devDebugSettings.renderDebug.hideGrassLod0,
            devDebugSettings.renderDebug.hideGrassLod1,
            devDebugSettings.renderDebug.hideGrassLod2,
          ],
          flowerHidden: devDebugSettings.renderDebug.hideGrassFlowers,
        }
      : undefined,
    inspector: sampleInspectorReport(),
    notes: [
      'GPU ms come from WebGPU timestamp-query via Three.js resolveTimestampsAsync (one frame delayed).',
      'CPU sections are User Timing measures named pantheon/<section> — visible in Chrome Performance.',
      'inspector.averages match the Inspector Performance tab (rolling CPU/GPU per pass). Enable Inspector first.',
      'Spector.js is WebGL-only and is not useful for this WebGPU/TSL project.',
      'If backend is webgl, disable Inspector Force WebGL and reload — this project is WebGPU-only.',
      'Overlay / stats-gl triangles count InstancedMesh capacity (allocated), not GPU indirect instanceCount. Use grass.allocatedPerRing vs grass.compactedPerRing.',
      'estimatedVisibleTotal is map-average biome weight × allocated capacity, not frustum occupancy.',
    ],
  };
}

export function logGpuDevice(): void {
  if (!rendererRef) return;
  const snap = capturePerformanceSnapshot();
  console.info('[Perf] GPU device', snap.adapter);
  console.info('[Perf] renderer.info', {
    render: rendererRef.info.render,
    compute: rendererRef.info.compute,
    memory: rendererRef.info.memory,
  });
}

export async function exportPerformanceSnapshot(): Promise<void> {
  if (grassRef) {
    try {
      await grassRef.syncBladeStatsFromGpu();
    } catch (err) {
      console.error('[Perf] grass compact readback failed:', err);
    }
  }
  const snap = capturePerformanceSnapshot();
  downloadPerformanceSnapshot(snap);
  logInspectorReport(snap.inspector);
  void copyPerformanceSnapshot(snap).then((ok) => {
    if (ok) console.info('[Perf] snapshot copied to clipboard');
  });
}

export function disposePerformanceSuite(): void {
  disposeOverlay();
  disposeThreeInspector(rendererRef);
  resetFrameStats();
  rendererRef = null;
  grassRef = undefined;
  lastHud = EMPTY_HUD;
  if (typeof window !== 'undefined') {
    delete window.__pantheonPerf;
  }
}

declare global {
  interface Window {
    __pantheonPerf?: {
      snapshot: () => PerformanceSnapshot;
      logDevice: () => void;
      exportSnapshot: () => Promise<void>;
      overlay: (enabled: boolean) => void;
      inspector: (enabled: boolean) => void;
      inspectorReport: () => InspectorPerfReport | null;
    };
  }
}
