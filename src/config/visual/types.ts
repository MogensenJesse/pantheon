// src/config/visual/types.ts — shared visual tuning types

export type WaterTier = 'reflective' | 'cheap';

export type WaterReflectClouds = 'proxy' | 'full' | 'off';

/**
 * Map props in the planar reflector.
 * `large` = trees + rocks only (main silhouettes, ~cheapest useful reflection).
 * `all` = every instanced prop, including foliage and pebbles.
 * `off` = no props in reflections.
 */
export type WaterReflectProps = 'off' | 'large' | 'all';

export type UpscalingMethod = 'fsr1' | 'bilinear';

export type AaMethod = 'smaa' | 'fxaa' | 'off';

/** Scene-pass MSAA sample count. WebGPU supports 4 or none; 0 = off. */
export type MsaaSamples = 0 | 4;

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

export type SunShadowFilterMode = 'soft' | 'vogel' | 'coverage';
