// src/rendering/atmosphere/heightSlabFogTsl.ts — closed-form path through a world-Y fog slab
import { abs, clamp, exp, float, length, max, min, mix, select, smoothstep } from 'three/tsl';

type TslNode = any;

const EPS = float(1e-4);
/**
 * Inside the slab, horizon / zenith veil uses this capped path (m) so looking up
 * at the sky fills instead of tracing the short path out of the ceiling.
 */
const INSIDE_HORIZON_M = float(280);

type SlabOverlap = {
  t0: TslNode;
  t1: TslNode;
  segLen: TslNode;
  dy: TslNode;
  y0: TslNode;
};

/** t in [0,1] where segment `p0`→`p1` overlaps world-Y `[yLo, yHi]`. */
function slabSegmentOverlap(p0: TslNode, p1: TslNode, yLo: TslNode, yHi: TslNode): SlabOverlap {
  const lo = min(yLo, yHi);
  const hi = max(yLo, yHi);
  const delta = p1.sub(p0);
  const segLen = length(delta);
  const dy = delta.y;
  const y0 = p0.y;
  const dyAbs = abs(dy);
  const dySafe = select(dyAbs.lessThan(EPS), float(1), dy);
  const tLo = lo.sub(y0).div(dySafe);
  const tHi = hi.sub(y0).div(dySafe);
  const t0s = max(float(0), min(tLo, tHi));
  const t1s = min(float(1), max(tLo, tHi));
  const hit = t1s.greaterThan(t0s);
  const inSlab = y0.greaterThanEqual(lo).and(y0.lessThanEqual(hi));
  const t0 = select(dyAbs.lessThan(EPS), float(0), select(hit, t0s, float(0)));
  const t1 = select(
    dyAbs.lessThan(EPS),
    select(inSlab, float(1), float(0)),
    select(hit, t1s, float(0)),
  );
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
  const fade = max(hi.sub(coreHi), EPS);
  const A = hi.sub(ov.y0).div(fade);
  const B = ov.dy.negate().div(fade);
  const dt = max(ov.t1.sub(ov.t0), float(0));
  const t1sq = ov.t1.mul(ov.t1);
  const t0sq = ov.t0.mul(ov.t0);
  const t1cu = t1sq.mul(ov.t1);
  const t0cu = t0sq.mul(ov.t0);
  const integ = A.mul(A)
    .mul(dt)
    .add(A.mul(B).mul(t1sq.sub(t0sq)))
    .add(B.mul(B).mul(t1cu.sub(t0cu)).div(float(3)));
  return max(density.mul(ov.segLen).mul(integ), float(0));
}

function clipToRayMax(p0: TslNode, p1: TslNode, rayMaxM: TslNode): TslNode {
  const delta = p1.sub(p0);
  const segLen = length(delta);
  const t = min(segLen, rayMaxM).div(max(segLen, EPS));
  return p0.add(delta.mul(t));
}

/**
 * Beer-Lambert mix 0..1 for a Y slab with a quadratic density fade at the ceiling.
 * From a ridge, the path integral keeps a thick pool. From *inside*, horizon and
 * zenith use a height-weighted veil (sky fills; no core-roof lid). Looking *down*
 * still uses the path through the pool so nearby ground stays readable.
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
): TslNode {
  const lo = min(yLo, yHi);
  const hi = max(yLo, yHi);
  const p1c = clipToRayMax(p0, p1, rayMaxM);
  const fade = min(max(fadeM, EPS), hi.sub(lo).mul(float(0.75)));
  const coreHi = hi.sub(fade);

  const coreOpt = heightSlabPathLength(p0, p1c, lo, coreHi).mul(density);
  const fadeOpt = opticalQuadraticTopFade(p0, p1c, coreHi, hi, density);
  const pathOpt = coreOpt.add(fadeOpt);

  const y0 = p0.y;
  const inBand = y0.greaterThanEqual(lo).and(y0.lessThanEqual(hi));
  const w = clamp(hi.sub(y0).div(fade), float(0), float(1));
  const insideW = select(inBand, w.mul(w), float(0));
  const ambientOpt = ambientM.mul(insideW).mul(density);

  const delta = p1.sub(p0);
  const segLen = max(length(delta), EPS);
  const downT = smoothstep(float(0.04), float(0.24), max(delta.y.negate(), float(0)).div(segLen));
  const localLen = min(segLen, min(rayMaxM, INSIDE_HORIZON_M));
  // Linear height weight so zenith still milks in the fade band (w² is too thin).
  const surroundW = select(inBand, w, float(0));
  const localOpt = density.mul(localLen).mul(surroundW);
  const camOpt = mix(localOpt, pathOpt, select(inBand, downT, float(1)));

  const optical = camOpt.add(ambientOpt);
  return float(1).sub(exp(optical.negate())).saturate();
}
