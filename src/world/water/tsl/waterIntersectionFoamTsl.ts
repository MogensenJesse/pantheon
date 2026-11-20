// src/world/water/tsl/waterIntersectionFoamTsl.ts — shore waves: foam fronts on the water, wet sand on the beach
//
// Two fronts run at once, half a cycle apart. Each is born `uShoreBreakM` out, runs toward the waterline (fast, then
// slowing) and merges into the waterline when the uprush starts; seaward of it the water carries a foam trail. The water's
// edge itself moves (the swash, tsl/waterRunUpTsl.ts); the foam is measured from where it really is, so the fronts, the
// fringe and the edge are one thing. The sand is wet up to the highest recent swash and dries behind it.
// Twin of the curves in waves/waveMath.ts. The phase is a function of world XZ and the wind clock only.
import { Fn, float, fwidth, If, max, mix, smoothstep } from 'three/tsl';
import { edgePulse, shoreFrontM, shoreWavePhases, swashLobe, wetPulse } from './waterRunUpTsl';
import { lakeMulTsl, lakeShareTsl } from './waterWavesTsl';

type TslNode = any;

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

/**
 * Wet sand on terrain: dark up to the highest recent swash (measured in height above the mean level, `heightAboveM`, like
 * the swash), fading out over its top part, drying behind it; plus a lighter, much wider band of moist sand (always a
 * little wet near the sea, whether or not a wave reaches it): `uShoreMoistM` metres inland from the waterline, capped at
 * `uShoreMoistH` of height. `distM` is the horizontal distance to the real waterline (positive underwater, which is not
 * darkened), `aaM` its `fwidth` (or a height-based proxy) in uniform control flow. The caller gates it to the heights the
 * swash and the moist band cover.
 */
export const applyWaterTerrainWetnessTsl = Fn(
  ([baseColor, worldXZ, distM, heightAboveM, wave, aaM]: TslNode[]) => {
    const aa = max(aaM, float(FOAM_AA_MIN_M));
    const ph = shoreWavePhases(worldXZ, wave);
    const reach = max(wetPulse(ph.p1, wave), wetPulse(ph.p2, wave));
    // a lake's swash is smaller (the same share the water mesh lifts by), so its wet sand is a narrower strip
    const k = lakeMulTsl(lakeShareTsl(worldXZ), wave.uLakeSwashShare);
    const dampH = wave.uShoreDampH.mul(k);
    const peak = wave.uShoreSwashH.mul(k).mul(float(1).sub(wave.uShoreRecede)).mul(1.1).max(dampH);
    const lobe = swashLobe(worldXZ, wave);
    const wetH = mix(dampH, peak, reach).mul(lobe).max(1e-3);
    const ground = float(1).sub(smoothstep(float(0), aa, distM));
    const wet = float(1)
      .sub(smoothstep(wetH.mul(0.6), wetH, heightAboveM))
      .mul(ground);
    // the lobes make the moist band's inland edge uneven too
    const moistW = wave.uShoreMoistM.mul(lobe).max(1e-3);
    const moist = float(1)
      .sub(smoothstep(float(0), moistW, distM.negate()))
      .mul(
        float(1).sub(
          smoothstep(wave.uShoreMoistH.mul(0.5), wave.uShoreMoistH.max(1e-3), heightAboveM),
        ),
      )
      .mul(ground);
    const darken = max(wet.mul(wave.uWetSandDarken), moist.mul(wave.uMoistDarken));
    return baseColor.mul(float(1).sub(darken));
  },
);
