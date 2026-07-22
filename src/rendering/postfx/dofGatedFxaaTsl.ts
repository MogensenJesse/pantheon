// src/rendering/postfx/dofGatedFxaaTsl.ts
// Full-frame FXAA after DoF softens in-focus pixels. Gate FXAA by the same CoC as DoF
// so only defocused regions get the cleanup (half-res bokeh upscale jaggies).
//
// `fxaa()` is a TempNode + convertToTexture — a full RTT pass, not an inline expression.
// Per-pixel `If` cannot skip that pass; wiring is gated in createPostFxPipeline when
// bokeh is near the energy-cap floor. The pass itself stays full-res so it can clean
// DoF's half-res bokeh upscale (half-res FXAA was too soft and reintroduced aliasing).
import { abs, Fn, float, If, mix, smoothstep } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import type { TslNode } from './depthAwareBlend.js';

/** Wire CoC-gated FXAA only while bokeh is clearly above the energy-cap floor. */
export const DOF_GATED_FXAA_BOKEH_MARGIN = 0.5;

/**
 * Whether the post graph should reference `fxaa()` for SMAA+DoF cleanup.
 * Near `BOKEH_SCALE_END` the half-res bokeh jaggies are mild — skip the whole TempNode pass.
 */
export function shouldWireDofGatedFxaa(bokehScale: number): boolean {
  return bokehScale > VISUAL.dof.BOKEH_SCALE_END + DOF_GATED_FXAA_BOKEH_MARGIN;
}

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
 * In-focus pixels skip the FXAA texture sample via TSL `If` (the FXAA RTT pass itself
 * is gated at pipeline wiring time — see `shouldWireDofGatedFxaa`).
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
