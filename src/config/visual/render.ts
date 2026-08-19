// src/config/visual/render.ts — tonemap exposure, AA, upscaling

import { SKY_EXPOSURE_CURVE } from './sky.ts';
import type { AaMethod, MsaaSamples, UpscalingMethod, UpscalingSettings } from './types.ts';

export const render = {
  toneMappingExposure: SKY_EXPOSURE_CURVE.groundHigh,
  /**
   * SMAA: silhouette soft + short edge walk on working color before DoF; when DoF is
   * active, FXAA cleans half-res bokeh only where CoC is high (in-focus stays sharp).
   * FXAA method: full-frame after grade/DoF. Default SMAA.
   */
  aaMethod: 'smaa' as AaMethod,
  /**
   * MSAA on the postFX scene pass render target — hardware coverage AA for subpixel
   * grass blades and foliage silhouettes, which morphological AA cannot reconstruct.
   * Separate from renderer MSAA, which must stay off (see `SceneSetup.ts`).
   * WebGPU resolves color but not depth, so god rays / DoF / bloom sky mask read a
   * multisampled depth texture. Set 0 if that path throws validation errors.
   */
  msaaSamples: 0 as MsaaSamples,
  /**
   * Play-mode resolution scaling + optional FSR1 upscale after AA.
   * Only helps when fragment-bound; validate with DEV FPS counter + render-debug toggles.
   * RCAS sharpness ~1.2 (not 0) so upscale does not fight FXAA/SMAA on foliage.
   */
  upscaling: {
    enabled: false,
    resolutionScale: 0.67,
    method: 'fsr1' as UpscalingMethod,
    sharpness: 1.2,
    denoise: true,
  } satisfies UpscalingSettings,
} as const;
