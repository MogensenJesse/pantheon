// src/dev/profiling/threeInspector.ts — Three.js WebGPU Inspector (Performance / Memory / Timeline / TSL Graph)
import { InspectorBase, type WebGPURenderer } from 'three/webgpu';

const WINDOW_FRAMES = 120;

interface InspectorProfiler {
  panel: HTMLElement;
  togglePanel: () => void;
}

interface InspectorStatsNode {
  cid: string;
  name: string;
  cpu?: number;
  gpu?: number;
  gpuNotAvailable?: boolean;
  isRenderStats?: boolean;
  isComputeStats?: boolean;
  children?: InspectorStatsNode[];
  renderTarget?: { name?: string } | null;
}

interface InspectorFrame {
  frameId: number;
  deltaTime: number;
  cpu?: number;
  gpu?: number;
  total?: number;
  miscellaneous?: number;
  resolvedCompute?: boolean;
  resolvedRender?: boolean;
  children?: InspectorStatsNode[];
}

interface InspectorStatsData {
  cpu?: number;
  gpu?: number;
  total?: number;
  stats?: InspectorStatsNode[];
}

interface InspectorLike {
  init: () => void;
  domElement: HTMLElement;
  profiler?: InspectorProfiler;
  fps?: number;
  frames?: InspectorFrame[];
  lastFrame?: InspectorFrame | null;
  statsData?: Map<string, InspectorStatsData>;
}

export type InspectorPassKind = 'render' | 'compute' | 'other';

export interface InspectorPassSample {
  name: string;
  kind: InspectorPassKind;
  cid: string;
  cpuMs: number;
  gpuMs: number;
  gpuAvailable: boolean;
  target?: string;
  children: InspectorPassSample[];
}

export interface InspectorPassAverage {
  name: string;
  kind: InspectorPassKind;
  cid: string;
  cpuMs: number;
  gpuMs: number;
  totalMs: number;
  samples: number;
}

export interface InspectorPerfReport {
  fps: number;
  frameCount: number;
  resolvedCount: number;
  summary: string[];
  lastResolved: {
    frameId: number;
    deltaMs: number;
    cpuMs: number;
    gpuMs: number;
    totalMs: number;
    idleMs: number;
    passes: InspectorPassSample[];
  } | null;
  averages: InspectorPassAverage[];
  window: {
    frames: number;
    deltaMsAvg: number;
    deltaMsP95: number;
    gpuMsAvg: number;
    gpuMsP95: number;
  };
}

let inspector: InspectorLike | null = null;
let inspectorLoad: Promise<InspectorLike> | null = null;
let attached = false;
/** Latest checkbox intent — drops a stale import if the user unchecks while loading. */
let wantEnabled = false;

function roundMs(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function passKind(stats: InspectorStatsNode): InspectorPassKind {
  if (stats.isComputeStats) return 'compute';
  if (stats.isRenderStats) return 'render';
  return 'other';
}

function targetLabel(stats: InspectorStatsNode): string | undefined {
  if (!stats.isRenderStats) return undefined;
  const rt = stats.renderTarget;
  if (rt == null) return 'canvas';
  return rt.name && rt.name !== '' ? rt.name : 'rt';
}

function serializePass(stats: InspectorStatsNode, data: InspectorStatsData | undefined): InspectorPassSample {
  const target = targetLabel(stats);
  return {
    name: stats.name || stats.cid,
    kind: passKind(stats),
    cid: stats.cid,
    cpuMs: roundMs(data?.cpu ?? stats.cpu ?? 0),
    gpuMs: roundMs(data?.gpu ?? stats.gpu ?? 0),
    gpuAvailable: stats.gpuNotAvailable !== true,
    ...(target !== undefined ? { target } : {}),
    children: (stats.children ?? []).map((child) => serializePass(child, inspector?.statsData?.get(child.cid))),
  };
}

function isResolvedFrame(frame: InspectorFrame): boolean {
  return (
    frame.resolvedCompute === true &&
    frame.resolvedRender === true &&
    typeof frame.gpu === 'number' &&
    typeof frame.cpu === 'number'
  );
}

function collectCids(passes: InspectorPassSample[], into: Set<string>): void {
  for (const pass of passes) {
    into.add(pass.cid);
    collectCids(pass.children, into);
  }
}

async function ensureInspector(): Promise<InspectorLike> {
  if (inspector) return inspector;
  if (!inspectorLoad) {
    inspectorLoad = import('three/addons/inspector/Inspector.js')
      .then((mod) => {
        const InspectorCtor = (mod as { Inspector: new () => InspectorLike }).Inspector;
        inspector = new InspectorCtor();
        return inspector;
      })
      .catch((err: unknown) => {
        inspectorLoad = null;
        throw err;
      });
  }
  return inspectorLoad;
}

function mountInspector(renderer: WebGPURenderer, instance: InspectorLike): void {
  renderer.inspector = instance as unknown as InspectorBase;
  // renderer.init() already ran with InspectorBase; the addon Inspector must mount its DOM itself.
  instance.init();
  attached = true;
  const profiler = instance.profiler;
  if (profiler && !profiler.panel.classList.contains('visible')) {
    profiler.togglePanel();
  }
}

function unmountInspector(renderer: WebGPURenderer | null): void {
  inspector?.domElement.remove();
  if (renderer) {
    renderer.inspector = new InspectorBase();
  }
  attached = false;
}

export function isInspectorAttached(): boolean {
  return attached;
}

export async function setThreeInspectorEnabled(
  renderer: WebGPURenderer,
  enabled: boolean,
): Promise<void> {
  if (!import.meta.env.DEV) return;
  wantEnabled = enabled;
  if (enabled) {
    const instance = await ensureInspector();
    if (!wantEnabled) return;
    mountInspector(renderer, instance);
  } else {
    unmountInspector(renderer);
  }
}

export function disposeThreeInspector(renderer: WebGPURenderer | null): void {
  wantEnabled = false;
  unmountInspector(renderer);
  inspector = null;
  inspectorLoad = null;
}

/**
 * Distill Inspector Performance-tab data: last resolved pass tree + rolling GPU/CPU averages.
 * Returns null when Inspector is off or has not recorded frames yet.
 */
export function sampleInspectorReport(): InspectorPerfReport | null {
  if (!import.meta.env.DEV || !attached || !inspector) return null;
  const frames = inspector.frames ?? [];
  if (frames.length === 0) return null;

  const resolved = frames.filter(isResolvedFrame);
  const last = resolved.length > 0 ? resolved[resolved.length - 1]! : null;
  const windowFrames = resolved.slice(-WINDOW_FRAMES);
  const deltaMs = windowFrames.map((f) => f.deltaTime);
  const gpuMs = windowFrames.map((f) => f.gpu ?? 0);

  const averages: InspectorPassAverage[] = [];
  inspector.statsData?.forEach((data, cid) => {
    const lastStats = data.stats?.[data.stats.length - 1];
    if (!lastStats) return;
    averages.push({
      name: lastStats.name || cid,
      kind: passKind(lastStats),
      cid,
      cpuMs: roundMs(data.cpu ?? 0),
      gpuMs: roundMs(data.gpu ?? 0),
      totalMs: roundMs(data.total ?? (data.cpu ?? 0) + (data.gpu ?? 0)),
      samples: data.stats?.length ?? 0,
    });
  });
  averages.sort((a, b) => b.gpuMs - a.gpuMs);

  const lastResolved = last
    ? {
        frameId: last.frameId,
        deltaMs: roundMs(last.deltaTime),
        cpuMs: roundMs(last.cpu ?? 0),
        gpuMs: roundMs(last.gpu ?? 0),
        totalMs: roundMs(last.total ?? 0),
        idleMs: roundMs(last.miscellaneous ?? 0),
        passes: (last.children ?? []).map((child) => serializePass(child, inspector?.statsData?.get(child.cid))),
      }
    : null;

  const liveCids = new Set<string>();
  if (lastResolved) collectCids(lastResolved.passes, liveCids);
  const liveAverages =
    liveCids.size > 0 ? averages.filter((row) => liveCids.has(row.cid)) : averages;

  const topGpu = liveAverages
    .filter((a) => a.gpuMs > 0)
    .slice(0, 5)
    .map((a) => `${a.name} ${a.gpuMs.toFixed(2)}`)
    .join(' · ');

  const summary: string[] = [
    `Inspector ${roundMs(inspector.fps ?? 0)} FPS · ${resolved.length} resolved / ${frames.length} captured frames`,
  ];
  if (lastResolved) {
    summary.push(
      `Last frame GPU ${lastResolved.gpuMs.toFixed(2)}ms · CPU ${lastResolved.cpuMs.toFixed(2)}ms · idle ${lastResolved.idleMs.toFixed(2)}ms · delta ${lastResolved.deltaMs.toFixed(2)}ms`,
    );
  }
  if (topGpu) summary.push(`Top GPU (rolling avg): ${topGpu}`);
  if (resolved.length === 0) {
    summary.push('GPU timestamps not resolved yet — wait a second after enabling Inspector.');
  }

  return {
    fps: roundMs(inspector.fps ?? 0),
    frameCount: frames.length,
    resolvedCount: resolved.length,
    summary,
    lastResolved,
    averages: liveAverages,
    window: {
      frames: windowFrames.length,
      deltaMsAvg: roundMs(mean(deltaMs)),
      deltaMsP95: roundMs(percentile(deltaMs, 95)),
      gpuMsAvg: roundMs(mean(gpuMs)),
      gpuMsP95: roundMs(percentile(gpuMs, 95)),
    },
  };
}

/** Print a compact per-pass table (same numbers the Inspector Performance tab shows). */
export function logInspectorReport(report: InspectorPerfReport | null = sampleInspectorReport()): void {
  if (!import.meta.env.DEV) return;
  if (!report) {
    console.info(
      '[Perf] Inspector report unavailable — enable Three.js Inspector and wait a second for GPU timestamps.',
    );
    return;
  }
  for (const line of report.summary) {
    console.info(`[Perf] ${line}`);
  }
  if (report.averages.length > 0) {
    console.table(
      report.averages.slice(0, 24).map((row) => ({
        name: row.name,
        kind: row.kind,
        cpuMs: row.cpuMs,
        gpuMs: row.gpuMs,
        totalMs: row.totalMs,
      })),
    );
  }
}
