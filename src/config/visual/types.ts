// src/config/visual/types.ts — shared visual tuning types

export type WaterTier = 'reflective' | 'cheap';

export type WaterReflectClouds = 'proxy' | 'full' | 'off';

export type UpscalingMethod = 'fsr1' | 'bilinear';

export type AaMethod = 'smaa' | 'fxaa' | 'off';

export interface UpscalingSettings {
  enabled: boolean;
  /** Internal scene-pass scale; 1 = native. FSR skipped when scale is 1. */
  resolutionScale: number;
  method: UpscalingMethod;
  /** RCAS strength — 0 = max sharpen, 2 = none. */
  sharpness: number;
  /** Attenuate RCAS in noisy areas. */
  denoise: boolean;
}

export type SunShadowFilterMode = 'soft' | 'vogel';
