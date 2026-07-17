// src/rendering/postfx/smaaSilhouetteResolveTsl.ts
// Official SMAA blend + contrast-gated neighborhood soft + short FXAA-style edge walk
// (only on high-contrast silhouette pixels — tree/sky stairs, not full-frame FXAA).
import {
  abs,
  Break,
  clamp,
  dot,
  Fn,
  float,
  If,
  Loop,
  max,
  min,
  mix,
  screenUV,
  select,
  vec2,
  vec3,
} from 'three/tsl';
import type { TslNode } from './depthAwareBlend.js';

const LUMA_W = vec3(0.299, 0.587, 0.114);
/** Short walk — enough for silhouette stairs without FXAA’s long soft search. */
const WALK_STEPS = 4;
const WALK_GUESS = 3.0;

export type SmaaSilhouetteResolveInputs = {
  smaaTex: TslNode;
  edgesTex: TslNode;
  colorTex: TslNode;
  invSize: TslNode;
};

/**
 * Resolve color for the SMAA path: morphological blend as base, then silhouette soft +
 * a short FXAA-style edge walk gated on SMAA edges × local luma contrast.
 */
export function createSmaaSilhouetteResolveNode(inputs: SmaaSilhouetteResolveInputs): TslNode {
  const { smaaTex, edgesTex, colorTex, invSize } = inputs;

  const sampleLuma = (uv: TslNode) => dot(colorTex.sample(uv).rgb, LUMA_W);

  return Fn(() => {
    const uv = screenUV;
    // Drives SMAA.updateBefore (edges / weights / blend).
    const official = smaaTex.sample(uv);
    const e = edgesTex.sample(uv);
    const edge = max(e.r, e.g);

    const c = colorTex.sample(uv);
    const dx = vec2(invSize.x, 0);
    const dy = vec2(0, invSize.y);
    const cL = colorTex.sample(uv.sub(dx));
    const cR = colorTex.sample(uv.add(dx));
    const cD = colorTex.sample(uv.sub(dy));
    const cU = colorTex.sample(uv.add(dy));
    const cL2 = colorTex.sample(uv.sub(dx.mul(2)));
    const cR2 = colorTex.sample(uv.add(dx.mul(2)));
    const cD2 = colorTex.sample(uv.sub(dy.mul(2)));
    const cU2 = colorTex.sample(uv.add(dy.mul(2)));

    const l = dot(c.rgb, LUMA_W);
    const lL = dot(cL.rgb, LUMA_W);
    const lR = dot(cR.rgb, LUMA_W);
    const lU = dot(cU.rgb, LUMA_W);
    const lD = dot(cD.rgb, LUMA_W);
    const contrast = max(abs(l.sub(lL)), abs(l.sub(lR)), abs(l.sub(lU)), abs(l.sub(lD)));
    // Tree/sky stairs ≈ high local contrast; grass micro-edges stay lower after clamp.
    const sil = clamp(contrast.sub(0.1).mul(3.5), float(0), float(1));

    const avg1H = cL.add(cR).mul(0.5);
    const avg1V = cD.add(cU).mul(0.5);
    const avg2H = cL2.add(cR2).mul(0.5);
    const avg2V = cD2.add(cU2).mul(0.5);
    const softH = mix(avg1H, avg2H, sil.mul(0.55));
    const softV = mix(avg1V, avg2V, sil.mul(0.55));
    const cNW = colorTex.sample(uv.sub(dx).sub(dy));
    const cNE = colorTex.sample(uv.add(dx).sub(dy));
    const cSW = colorTex.sample(uv.sub(dx).add(dy));
    const cSE = colorTex.sample(uv.add(dx).add(dy));
    const softDiag = cNW.add(cNE).add(cSW).add(cSE).mul(0.25);
    const softAxis = mix(softH, softV, clamp(e.g.div(max(e.r.add(e.g), float(1e-3))), 0, 1));
    const soft = mix(softAxis, softDiag, sil.mul(0.4));
    const edgeSoft = mix(c, soft, clamp(edge.mul(mix(float(0.55), float(1.2), sil)), 0, 1));
    const boost = edge.mul(mix(float(0.25), float(0.95), sil));
    const base = mix(official, edgeSoft, boost).toVar();

    // Short FXAA-style edge walk — only on high-contrast SMAA edges (silhouettes).
    const walkGate = edge.mul(sil);
    If(walkGate.greaterThan(0.35), () => {
      // Prefer SMAA’s own orientation: e.g = horizontal (north), e.r = vertical (west).
      const isHorizontal = e.g.greaterThanEqual(e.r);

      const pLum = select(isHorizontal, lD, lR);
      const nLum = select(isHorizontal, lU, lL);
      const pGrad = abs(pLum.sub(l));
      const nGrad = abs(nLum.sub(l));

      const pixelStep = select(isHorizontal, invSize.y, invSize.x).toVar();
      const oppositeLum = float().toVar();
      const gradient = float().toVar();
      If(pGrad.lessThan(nGrad), () => {
        pixelStep.assign(pixelStep.negate());
        oppositeLum.assign(nLum);
        gradient.assign(nGrad);
      }).Else(() => {
        oppositeLum.assign(pLum);
        gradient.assign(pGrad);
      });

      const uvEdge = vec2(uv).toVar();
      const edgeStep = vec2().toVar();
      If(isHorizontal, () => {
        uvEdge.y.addAssign(pixelStep.mul(0.5));
        edgeStep.assign(vec2(invSize.x, 0));
      }).Else(() => {
        uvEdge.x.addAssign(pixelStep.mul(0.5));
        edgeStep.assign(vec2(0, invSize.y));
      });

      const edgeLum = l.add(oppositeLum).mul(0.5);
      const gradThresh = gradient.mul(0.25);

      // Positive direction walk.
      const puv = uvEdge.add(edgeStep).toVar();
      const pDelta = sampleLuma(puv).sub(edgeLum).toVar();
      const pAtEnd = abs(pDelta).greaterThanEqual(gradThresh).toVar();
      Loop({ start: 1, end: WALK_STEPS }, () => {
        If(pAtEnd, () => {
          Break();
        });
        puv.addAssign(edgeStep);
        pDelta.assign(sampleLuma(puv).sub(edgeLum));
        pAtEnd.assign(abs(pDelta).greaterThanEqual(gradThresh));
      });
      If(pAtEnd.not(), () => {
        puv.addAssign(edgeStep.mul(WALK_GUESS));
      });

      // Negative direction walk.
      const nuv = uvEdge.sub(edgeStep).toVar();
      const nDelta = sampleLuma(nuv).sub(edgeLum).toVar();
      const nAtEnd = abs(nDelta).greaterThanEqual(gradThresh).toVar();
      Loop({ start: 1, end: WALK_STEPS }, () => {
        If(nAtEnd, () => {
          Break();
        });
        nuv.subAssign(edgeStep);
        nDelta.assign(sampleLuma(nuv).sub(edgeLum));
        nAtEnd.assign(abs(nDelta).greaterThanEqual(gradThresh));
      });
      If(nAtEnd.not(), () => {
        nuv.subAssign(edgeStep.mul(WALK_GUESS));
      });

      const pDist = select(isHorizontal, puv.x.sub(uv.x), puv.y.sub(uv.y)).toVar();
      const nDist = select(isHorizontal, uv.x.sub(nuv.x), uv.y.sub(nuv.y)).toVar();
      // Avoid zero / negative if walk didn’t move.
      pDist.assign(max(pDist, float(1e-4)));
      nDist.assign(max(nDist, float(1e-4)));

      const shortest = min(pDist, nDist);
      const deltaSign = select(
        pDist.lessThanEqual(nDist),
        pDelta.greaterThanEqual(0),
        nDelta.greaterThanEqual(0),
      );
      const centerAbove = l.sub(edgeLum).greaterThanEqual(0);
      // Different sides of the edge → apply FXAA distance blend (same-side = 0).
      const oppositeSides = select(deltaSign, centerAbove.not(), centerAbove);

      const edgeBlend = float(0).toVar();
      If(oppositeSides, () => {
        edgeBlend.assign(float(0.5).sub(shortest.div(pDist.add(nDist))));
      });

      // Subpixel hint from local contrast (FXAA-style, scaled down).
      const cNW_l = dot(cNW.rgb, LUMA_W);
      const cNE_l = dot(cNE.rgb, LUMA_W);
      const cSW_l = dot(cSW.rgb, LUMA_W);
      const cSE_l = dot(cSE.rgb, LUMA_W);
      const neighborhood = float(2)
        .mul(lD.add(lR).add(lU).add(lL))
        .add(cSE_l.add(cSW_l).add(cNE_l).add(cNW_l))
        .mul(1 / 12);
      const sub = abs(neighborhood.sub(l));
      const range = max(contrast, float(1e-4));
      const subBlend = clamp(sub.div(range), 0, 1);
      const subBlendSq = subBlend.mul(subBlend).mul(0.65);

      const finalBlend = max(edgeBlend, subBlendSq).mul(sil);
      const walkUv = vec2(uv).toVar();
      If(isHorizontal, () => {
        walkUv.y.addAssign(pixelStep.mul(finalBlend));
      }).Else(() => {
        walkUv.x.addAssign(pixelStep.mul(finalBlend));
      });

      const walked = colorTex.sample(walkUv);
      // Blend walk result in proportion to silhouette strength (keep morph/soft base).
      base.assign(mix(base, walked, clamp(walkGate.mul(0.85), 0, 1)));
    });

    return base;
  })() as TslNode;
}
