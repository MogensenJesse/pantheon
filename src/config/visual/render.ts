// src/config/visual/render.ts — AA, MSAA, upscaling

import type { AaMethod, MsaaSamples, UpscalingMethod, UpscalingSettings } from './types.ts';

export const render = {
  /** Default SMAA; FXAA full-frame when aaMethod = fxaa. */
  aaMethod: 'smaa' as AaMethod,
  /**
   * MSAA on postFX scene pass (not renderer MSAA). WebGPU resolves color not depth —
   * god rays/DoF/bloom read multisampled depth. Set 0 on validation errors.
   */
  msaaSamples: 0 as MsaaSamples,
  upscaling: {
    // Whole-screen FSR1: the scene pass renders at resolutionScale of the canvas and is upscaled. Off by
    // default. Water reflections are separate: they already render at a fraction of screen size (VISUAL.water).
    enabled: false,
    resolutionScale: 0.67,
    method: 'fsr1' as UpscalingMethod,
    sharpness: 1.2,
    denoise: true,
  } satisfies UpscalingSettings,
} as const;
