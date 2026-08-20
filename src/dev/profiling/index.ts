// src/dev/profiling/index.ts — DEV profiling suite barrel

export { profileBeginFrame, profileEndFrame, profileMark } from './frameHooks';
export type { PerfHudModel } from './PerformanceSuite';
export {
  capturePerformanceSnapshot,
  disposePerformanceSuite,
  exportPerformanceSnapshot,
  getPerfHud,
  initPerformanceSuite,
  logGpuDevice,
  setPerformanceGrassSource,
  setPerformanceOverlayEnabled,
  setThreeInspectorVisible,
} from './PerformanceSuite';
export type { PerformanceSnapshot } from './snapshot';
export type { InspectorPassAverage, InspectorPassSample, InspectorPerfReport } from './threeInspector';
