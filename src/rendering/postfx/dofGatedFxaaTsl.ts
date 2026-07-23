// src/rendering/postfx/dofGatedFxaaTsl.ts
// Full-frame FXAA after DoF softens in-focus pixels. Gate FXAA by the same CoC as DoF
// so only defocused regions get the cleanup (half-res bokeh upscale jaggies).
//
// `fxaa()` is a TempNode + convertToTexture — a full RTT pass, not an inline expression.
// Per-pixel `If` cannot skip that pass; the RTT runs whenever DoF is active (SMAA path).
// In-focus pixels still skip the FXAA *sample* via the CoC `If` below.
import { abs, Fn, float, If, mix, smoothstep } from 'three/tsl';
import type { TslNode } from './depthAwareBlend.js';

export type DofGatedFxaaInputs = {
  /** Sharp DoF composite (SMAA’d beauty + bokeh). */
  sharpColor: TslNode;
  /** Full-res FXAA of the DoF output. */
  fxaaColor: TslNode;
  sceneViewZ: TslNode;
  uFocusDistance: TslNode;
  uFocalLength: TslNode;
};

/**
 * mix(sharp, fxaa, cocWeight) — cocWeight is 0 in focus, ramps up with DoF blur.
 * In-focus pixels skip the FXAA texture sample via TSL `If`.
 */
export function createDofGatedFxaaNode(inputs: DofGatedFxaaInputs): TslNode {
  const { sharpColor, fxaaColor, sceneViewZ, uFocusDistance, uFocalLength } = inputs;

  return Fn(() => {
    // Match DepthOfFieldNode CoC: smoothstep(0, focalLength, |viewZ + focus|).
    const signedDist = sceneViewZ.negate().sub(uFocusDistance);
    const coc = smoothstep(float(0), uFocalLength, abs(signedDist));
    // Keep near-focus sharp; only clearly defocused pixels take FXAA.
    const w = smoothstep(float(0.12), float(0.5), coc);
    const out = sharpColor.toVar();
    If(w.greaterThan(0.001), () => {
      out.assign(mix(sharpColor, fxaaColor, w));
    });
    return out;
  })() as TslNode;
}
