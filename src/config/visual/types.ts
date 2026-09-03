// src/config/visual/types.ts — shared visual tuning types

export type WaterTier = 'reflective' | 'cheap';

export type WaterReflectClouds = 'proxy' | 'full' | 'off';

/** `large` = trees+rocks; `all` = every prop; `off` = none. */
export type WaterReflectProps = 'off' | 'large' | 'all';

export type UpscalingMethod = 'fsr1' | 'bilinear';

export type AaMethod = 'smaa' | 'fxaa' | 'off';

/** WebGPU: 4 or 0. */
export type MsaaSamples = 0 | 4;

export interface UpscalingSettings {
  enabled: boolean;
  /** Scene-pass scale; FSR skipped at 1. */
  resolutionScale: number;
  method: UpscalingMethod;
  /** RCAS: 0 = max sharpen, 2 = none. */
  sharpness: number;
  denoise: boolean;
}
