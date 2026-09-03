// src/rendering/atmosphere/heightSlabFogTsl.ts — closed-form path through a world-Y fog slab
import { abs, clamp, exp, float, Fn, If, length, max, min, mix, smoothstep } from 'three/tsl';

type TslNode = any;

const EPS = float(1e-4);

type SlabOverlap = {
  t0: TslNode;
  t1: TslNode;
  segLen: TslNode;
  dy: TslNode;
  y0: TslNode;
};

/**
 * t in [0,1] where segment `p0`→`p1` overlaps world-Y `[yLo, yHi]`.
 * Horizontal vs sloped is TSL `If` so the divide runs only when `|dy| >= eps`.
 */
function slabSegmentOverlap(p0: TslNode, p1: TslNode, yLo: TslNode, yHi: TslNode): SlabOverlap {
  const lo = min(yLo, yHi);
  const hi = max(yLo, yHi);
  const delta = p1.sub(p0);
  const segLen = length(delta);
  const dy = delta.y;
  const y0 = p0.y;
  const t0 = float(0).toVar();
  const t1 = float(0).toVar();
  If(abs(dy).lessThan(EPS), () => {
    If(y0.greaterThanEqual(lo).and(y0.lessThanEqual(hi)), () => {
      t1.assign(float(1));
    });
  }).Else(() => {
    const tLo = lo.sub(y0).div(dy);
    const tHi = hi.sub(y0).div(dy);
    const t0s = max(float(0), min(tLo, tHi));
    const t1s = min(float(1), max(tLo, tHi));
    If(t1s.greaterThan(t0s), () => {
      t0.assign(t0s);
      t1.assign(t1s);
    });
  });
  return { t0, t1, segLen, dy, y0 };
}

/**
 * 3D length of segment `p0`→`p1` that overlaps the world-Y slab `[yLo, yHi]`.
 * Horizontal rays (parallel to XZ) use the full segment iff the camera is inside the slab.
 * No raymarch — a few ALU ops.
 */
export function heightSlabPathLength(
  p0: TslNode,
  p1: TslNode,
  yLo: TslNode,
  yHi: TslNode,
): TslNode {
  const ov = slabSegmentOverlap(p0, p1, yLo, yHi);
  return max(ov.t1.sub(ov.t0), float(0)).mul(ov.segLen);
}

/**
 * Optical depth through a top fade band `[coreHi, hi]` where weight
 * `w = (hi − y) / fade` and density = `d * w²` (thin at the ceiling, dense at core).
 * Closed-form: `w` is linear in t, so `∫ w² ds` is a cubic.
 */
function opticalQuadraticTopFade(
  p0: TslNode,
  p1: TslNode,
  coreHi: TslNode,
  hi: TslNode,
  density: TslNode,
): TslNode {
  const ov = slabSegmentOverlap(p0, p1, coreHi, hi);
  const optical = float(0).toVar();
  const dt = max(ov.t1.sub(ov.t0), float(0));
  If(dt.greaterThan(EPS), () => {
    const fade = max(hi.sub(coreHi), EPS);
    const A = hi.sub(ov.y0).div(fade);
    const B = ov.dy.negate().div(fade);
    const t1sq = ov.t1.mul(ov.t1);
    const t0sq = ov.t0.mul(ov.t0);
    const t1cu = t1sq.mul(ov.t1);
    const t0cu = t0sq.mul(ov.t0);
    const integ = A.mul(A)
      .mul(dt)
      .add(A.mul(B).mul(t1sq.sub(t0sq)))
      .add(B.mul(B).mul(t1cu.sub(t0cu)).div(float(3)));
    optical.assign(max(density.mul(ov.segLen).mul(integ), float(0)));
  });
  return optical;
}

function clipToRayMax(p0: TslNode, p1: TslNode, rayMaxM: TslNode): TslNode {
  const delta = p1.sub(p0);
  const segLen = length(delta);
  const t = min(segLen, rayMaxM).div(max(segLen, EPS));
  return p0.add(delta.mul(t));
}

function beerMix(optical: TslNode): TslNode {
  return float(1).sub(exp(optical.negate()));
}

/**
 * Beer-Lambert mix 0..1 for a Y slab with a quadratic density fade at the ceiling.
 * From a ridge (camera above `fogTop`), only the path through the layer — pool in
 * the bowl, sky stays clear. Under the ceiling (valley floor included, even below
 * `fogBase`) horizon and zenith use a surround veil so sky and distant ground
 * fill; looking down still uses the path so nearby ground stays readable.
 *
 * Surround mix is `fadeHeight^obscurePower × beer(τ)`, not `beer(τ × fadeHeight)`.
 * Under-ceiling veil is gated with TSL `If` so ridge fragments skip that ALU.
 */
export function heightSlabFogFactor(
  p0: TslNode,
  p1: TslNode,
  yLo: TslNode,
  yHi: TslNode,
  density: TslNode,
  rayMaxM: TslNode,
  ambientM: TslNode,
  fadeM: TslNode,
  obscurePower: TslNode,
): TslNode {
  return Fn(() => {
    const lo = min(yLo, yHi);
    const hi = max(yLo, yHi);
    const p1c = clipToRayMax(p0, p1, rayMaxM);
    const fade = min(max(fadeM, EPS), hi.sub(lo).mul(float(0.75)));
    const coreHi = hi.sub(fade);

    const coreOpt = heightSlabPathLength(p0, p1c, lo, coreHi).mul(density);
    const fadeOpt = opticalQuadraticTopFade(p0, p1c, coreHi, hi, density);
    const pathFactor = beerMix(coreOpt.add(fadeOpt));
    const mixFactor = pathFactor.toVar();

    If(p0.y.lessThanEqual(hi), () => {
      const w = clamp(hi.sub(p0.y).div(fade), float(0), float(1));
      const ambientFactor = beerMix(ambientM.mul(w.mul(w)).mul(density));
      const delta = p1.sub(p0);
      const segLen = max(length(delta), EPS);
      const downT = smoothstep(
        float(0.04),
        float(0.24),
        max(delta.y.negate(), float(0)).div(segLen),
      );
      const localLen = min(segLen, rayMaxM);
      const power = max(obscurePower, float(1));
      const localFactor = w.pow(power).mul(beerMix(density.mul(localLen)));
      const horizonFactor = max(localFactor, pathFactor);
      const camFactor = mix(horizonFactor, pathFactor, downT);
      mixFactor.assign(camFactor.oneMinus().mul(ambientFactor.oneMinus()).oneMinus());
    });

    return mixFactor.saturate();
  })();
}
