// src/config/visualTuning.ts — barrel: re-exports split modules under config/visual/
// Tune look in config/visual/*.ts. phase0.ts stays gameplay-only.

export type {
  AaMethod,
  MsaaSamples,
  SunShadowFilterMode,
  UpscalingMethod,
  UpscalingSettings,
  WaterReflectClouds,
  WaterReflectProps,
  WaterTier,
} from './visual';
export { VISUAL } from './visual';
