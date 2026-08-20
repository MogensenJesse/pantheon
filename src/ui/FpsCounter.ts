// src/ui/FpsCounter.ts — facade over the DEV performance overlay (stats.js + stats-gl)
export {
  disposePerformanceSuite as disposeFpsCounter,
  setPerformanceOverlayEnabled as setFpsCounterEnabled,
} from '../dev/profiling/PerformanceSuite';
