// src/world/terrain/tsl/terrainTextureBreakupTsl.ts — distance-faded macro albedo self-blend
import { clamp, Fn, float, fract, length, max, smoothstep, vec2 } from 'three/tsl';

type TslNode = any;

const BREAKUP_MIX_EPS = 1e-3;
const MACRO_SCALE_MIN = 1e-3;
const TAU = Math.PI * 2;
/** Large enough that stamp centers are not a square graph-paper lattice. */
const STAMP_JITTER = 0.35;
/** Warps which cell owns the pixel so influence blobs are not axis-aligned. */
const LATTICE_WARP = 0.3;

/** Same atlas slot at a larger world period: UV B = UV A / macroScale. */
export const breakupMacroWorldXZ = Fn(([worldXZ, macroScale]: TslNode[]) =>
  worldXZ.div(max(macroScale, float(MACRO_SCALE_MIN))),
);

/** Cheap 0–1 hash from a lattice vertex + salt (stable for integer ids). */
const breakupVertexHash = Fn(([vx, vy, salt]: TslNode[]) =>
  vx.mul(127.1).add(vy.mul(311.7)).add(salt).sin().mul(43758.5453).fract(),
);

/**
 * Wavy lattice UV for cell pick + weights only (macro sample UV stays unwarped).
 */
export const breakupLatticeP = Fn(([p]: TslNode[]) => {
  const wx = p.y.mul(2.09).add(p.x.mul(0.47)).sin().mul(LATTICE_WARP);
  const wy = p.x.mul(1.73).add(p.y.mul(0.91)).sin().mul(LATTICE_WARP);
  return vec2(p.x.add(wx), p.y.add(wy));
});

/**
 * Containing-cell corners + hermite bilinear weights (0 on the far edges so the
 * 2×2 window never clips a live stamp). Multiply by radial weight, then normalize.
 */
export function breakupBilinearStamps(q: TslNode): {
  v00x: TslNode;
  v00y: TslNode;
  v10x: TslNode;
  v10y: TslNode;
  v01x: TslNode;
  v01y: TslNode;
  v11x: TslNode;
  v11y: TslNode;
  b00: TslNode;
  b10: TslNode;
  b01: TslNode;
  b11: TslNode;
} {
  const ox = q.x.floor();
  const oy = q.y.floor();
  const sx = smoothstep(float(0), float(1), fract(q.x));
  const sy = smoothstep(float(0), float(1), fract(q.y));
  const omx = float(1).sub(sx);
  const omy = float(1).sub(sy);
  return {
    v00x: ox,
    v00y: oy,
    v10x: ox.add(1),
    v10y: oy,
    v01x: ox,
    v01y: oy.add(1),
    v11x: ox.add(1),
    v11y: oy.add(1),
    b00: omx.mul(omy),
    b10: sx.mul(omy),
    b01: omx.mul(sy),
    b11: sx.mul(sy),
  };
}

/**
 * Stamp influence with no solid core: `fade` 1 = falloff from the center, 0 = a small disc.
 * Squared envelope so the weight hits 0 smoothly.
 */
export const breakupStampWeight = Fn(([p, vx, vy, radius, fade]: TslNode[]) => {
  const jx = breakupVertexHash(vx, vy, float(4.19)).sub(0.5).mul(STAMP_JITTER);
  const jy = breakupVertexHash(vx, vy, float(5.73)).sub(0.5).mul(STAMP_JITTER);
  const cx = vx.add(0.5).add(jx);
  const cy = vy.add(0.5).add(jy);
  const dist = length(vec2(p.x.sub(cx), p.y.sub(cy)));
  const inner = radius.mul(float(1).sub(clamp(fade, 0, 1)));
  const t = float(1).sub(smoothstep(inner, max(radius, inner.add(float(0.05))), dist));
  return t.mul(t);
});

/**
 * Per-stamp rotate + phase-shift of the macro UV (not a local window around 0.5).
 */
export const breakupStampTileUv = Fn(([p, vx, vy, patchRotate]: TslNode[]) => {
  const ang = breakupVertexHash(vx, vy, float(1.17)).mul(float(TAU)).mul(patchRotate);
  const ox = breakupVertexHash(vx, vy, float(2.31));
  const oy = breakupVertexHash(vx, vy, float(3.73));
  const c = ang.cos();
  const s = ang.sin();
  const rx = p.x.mul(c).sub(p.y.mul(s)).add(ox);
  const ry = p.x.mul(s).add(p.y.mul(c)).add(oy);
  return vec2(rx.fract(), ry.fract());
});

/** 0 near the camera, 1 past endM — close-up UVs stay the authored seamless repeat. */
export const breakupDistanceWeight = Fn(([worldPos, camPos, startM, endM]: TslNode[]) => {
  const dist = worldPos.distance(camPos);
  const fadeEnd = max(endM, startM.add(float(1)));
  return clamp(smoothstep(startM, fadeEnd, dist), 0, 1);
});

/** Effective A→B mix: distance fade × blend (0.5 = 50/50 at full distance). */
export const breakupMixFactor = Fn(([distanceWeight, blend]: TslNode[]) =>
  clamp(distanceWeight.mul(blend), 0, 1),
);

/** Skip the second atlas fetch when the mix would be a no-op. */
export function breakupMixActive(mixW: TslNode): TslNode {
  return mixW.greaterThan(float(BREAKUP_MIX_EPS));
}
