// src/rendering/postfx/dofGatedFxaaTsl.ts
// Full-frame FXAA after DoF softens in-focus pixels. Gate FXAA by the same CoC as DoF
// so only defocused regions get the cleanup (half-res bokeh upscale jaggies).
import { abs, Fn, float, mix, smoothstep } from 'three/tsl';
import type { TslNode } from './depthAwareBlend.js';

export type DofGatedFxaaInputs = {
  /** Sharp DoF composite (SMAA’d beauty + bokeh). */
  sharpColor: TslNode;
  /** FXAA of the same DoF output. */
  fxaaColor: TslNode;
  sceneViewZ: TslNode;
  uFocusDistance: TslNode;
  uFocalLength: TslNode;
};

/**
 * mix(sharp, fxaa, cocWeight) — cocWeight is 0 in focus, ramps up with DoF blur.
 */
export function createDofGatedFxaaNode(inputs: DofGatedFxaaInputs): TslNode {
  const { sharpColor, fxaaColor, sceneViewZ, uFocusDistance, uFocalLength } = inputs;

  return Fn(() => {
    // Match DepthOfFieldNode CoC: smoothstep(0, focalLength, |viewZ + focus|).
    const signedDist = sceneViewZ.negate().sub(uFocusDistance);
    const coc = smoothstep(float(0), uFocalLength, abs(signedDist));
    // Keep near-focus sharp; only clearly defocused pixels take FXAA.
    const w = smoothstep(float(0.12), float(0.5), coc);
    return mix(sharpColor, fxaaColor, w);
  })() as TslNode;
}
