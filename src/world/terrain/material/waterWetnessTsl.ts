// src/world/terrain/material/waterWetnessTsl.ts — wet sand on the beach: dark up to the highest recent swash, a lighter moist band above it
//
// The swash itself and its phases are the water's (water/tsl/waterRunUpTsl.ts); this is only what it does to the terrain's colour.
import { Fn, float, max, mix, smoothstep } from 'three/tsl';
import { FOAM_AA_MIN_M } from '../../water/tsl/waterFoamTsl';
import { shoreWavePhases, swashLobe, wetPulse } from '../../water/tsl/waterRunUpTsl';
import { lakeMulTsl, lakeShareTsl } from '../../water/tsl/waterWavesTsl';

type TslNode = any;

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
