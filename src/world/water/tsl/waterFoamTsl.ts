// src/world/water/tsl/waterFoamTsl.ts — shore waves: the foam fronts on the water (the wet sand they leave on the beach is terrain/material/waterWetnessTsl.ts)
//
// Two fronts run at once, half a cycle apart. Each is born `uShoreBreakM` out, runs toward the waterline (fast, then
// slowing) and merges into the waterline when the uprush starts; seaward of it the water carries a foam trail. The water's
// edge itself moves (the swash, tsl/waterRunUpTsl.ts); the foam is measured from where it really is, so the fronts, the
// fringe and the edge are one thing.
// Twin of the curves in waves/waveMath.ts. The phase is a function of world XZ and the wind clock only.
import { Fn, float, fwidth, If, max, mix, smoothstep } from 'three/tsl';
import { edgePulse, shoreFrontM, shoreWavePhases } from './waterRunUpTsl';
import { lakeMulTsl, lakeShareTsl } from './waterWavesTsl';

type TslNode = any;

/** Smallest anti-aliasing width (m) of a foam or wet-sand edge, so a flat `fwidth` never makes it a hard line. */
export const FOAM_AA_MIN_M = 0.008;

/**
 * [0,1] foam from horizontal distance to the real waterline (positive = underwater): fronts with a trail behind them, plus a
 * thin fringe on the waterline that is strongest while the water climbs the beach. `fwidth` runs in uniform control flow so AA
 * stays legal inside the branch.
 *
 * Do not use `viewportLinearDepth` here: in this pass(scene) + transparent water path
 * the gap is ~0 on every water pixel and the disc goes white.
 */
export const waterSurfaceFoamMaskTsl = Fn(([worldXZ, wave, distM]: TslNode[]) => {
  const aa = max(fwidth(distM), float(FOAM_AA_MIN_M));
  const foam = float(0).toVar();
  // enclosed water (lakes): a narrower breaker zone and fainter foam
  const k = lakeMulTsl(lakeShareTsl(worldXZ), wave.uLakeFoamShare);
  const breakM = wave.uShoreBreakM.mul(k);
  const trailM = wave.uShoreTrailM.mul(k);
  // beyond the breaker zone there is nothing: skip the noise for the open sea
  If(distM.lessThan(breakM.add(trailM).add(1)), () => {
    const ph = shoreWavePhases(worldXZ, wave);
    const front = (p: TslNode) => {
      const d = distM.sub(shoreFrontM(p, wave, breakM));
      const lead = smoothstep(aa.negate(), float(0), d);
      const trail = float(1).sub(smoothstep(float(0), trailM, d));
      // born faintly, gone once it has merged into the waterline
      const born = smoothstep(float(0), float(0.12), p);
      const gone = float(1).sub(smoothstep(float(1).sub(wave.uShoreRiseShare), float(1), p));
      return lead.mul(trail).mul(born).mul(gone);
    };
    const onWater = smoothstep(aa.negate(), float(0), distM);
    const active = max(edgePulse(ph.p1, wave), edgePulse(ph.p2, wave));
    const fringe = float(1)
      .sub(smoothstep(float(0), wave.uShoreFringeM, distM))
      .mul(onWater)
      .mul(mix(float(0.35), float(1), active));
    const patch = mix(float(0.55), float(1), ph.n);
    foam.assign(
      max(max(front(ph.p1), front(ph.p2)), fringe)
        .mul(patch)
        .mul(wave.uShoreFoamAmount)
        .mul(k),
    );
  });
  return foam;
});

/** Composite foam onto water albedo (after refraction so the stripe sits on the surface). */
export const applyWaterSurfaceFoamColorTsl = Fn(([baseColor, foamMask, wave]: TslNode[]) =>
  mix(baseColor, wave.uFoamColor, foamMask as TslNode),
);

/** Lift opacity toward 1 under foam so submerged terrain cannot show through the stripe. */
export const applyWaterSurfaceFoamOpacityTsl = Fn(([baseAlpha, foamMask]: TslNode[]) =>
  mix(baseAlpha, float(1), foamMask as TslNode),
);
