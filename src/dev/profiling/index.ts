// src/dev/profiling/index.ts — DEV profiling suite barrel

export { profileBeginFrame, profileEndFrame, profileMark } from './frameHooks';
export {
  disposePerformanceSuite,
  exportPerformanceSnapshot,
  getPerfHud,
  initPerformanceSuite,
  logGpuDevice,
  setPerformanceGrassSource,
  setPerformanceOverlayEnabled,
  setPerformancePropLodSource,
  setThreeInspectorVisible,
} from './PerformanceSuite';
export type { PerformanceSnapshot } from './snapshot';
export type { InspectorPerfReport } from './threeInspector';
