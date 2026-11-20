// src/world/water/tsl/waterRunUpTsl.ts — the swash: the sea at the shore rises and falls, so the water's edge climbs the beach and retreats
//
// Two fronts run at once, half a cycle apart (`shoreWavePhases`). When a front arrives, the sea at the shore rises
// (the uprush) and then falls back (the backwash): `waterRunUpTsl` is that vertical offset. The water mesh lifts by it, and
// the foam, the wet sand and the caustics all measure from the surface it makes, so they all start on the same waterline.
// Everything is a function of world XZ, the water depth and the wind clock only. Twin of the swash curves in waves/waveMath.ts.
import { Fn, float, fract, If, max, mix, smoothstep, triNoise3D, vec3 } from 'three/tsl';
import { windUniforms } from '../../../rendering/ambience/windUniforms';
import type { WaterWaveUniforms } from '../material/waterWaveUniforms';
import { waterWaveUniforms } from '../material/waterWaveUniforms';
import { lakeMulTsl, lakeShareTsl } from './waterWavesTsl';

type TslNode = any;

/** Phase [0,1) of the two fronts at a point (half a cycle apart) and the along-shore noise [0,1] that bends them. */
export function shoreWavePhases(worldXZ: TslNode, wave: WaterWaveUniforms) {
  const clock = windUniforms.uWindClock;
  const n = triNoise3D(
    vec3(worldXZ.x, float(0), worldXZ.y).div(wave.uShoreAlongM),
    float(0.25),
    clock.mul(0.05),
  );
  const p1 = fract(clock.div(wave.uShorePeriodS).add(n.sub(0.5).mul(wave.uShoreWobble)));
  return { p1, p2: fract(p1.add(0.5)), n };
}

/** 0..1 patchiness of the swash along the beach: how much of its height a spot gets (1 - lobeShare .. 1). */
export function swashLobe(worldXZ: TslNode, wave: WaterWaveUniforms): TslNode {
  const n = triNoise3D(
    vec3(worldXZ.x, float(0), worldXZ.y).div(wave.uShoreLobeM),
    float(0.35),
    windUniforms.uWindClock.mul(0.08).add(11),
  ).clamp(0, 1);
  return mix(float(1).sub(wave.uShoreLobeShare), float(1), n);
}

/** Metres of water between a front and the real waterline at `phase`: born at the break line (`breakM`: the open sea's unless the caller narrows it), fast then slowing, at the waterline when the uprush starts. */
export function shoreFrontM(
  phase: TslNode,
  wave: WaterWaveUniforms,
  breakM: TslNode = wave.uShoreBreakM,
): TslNode {
  const t = phase.div(float(1).sub(wave.uShoreRiseShare).max(1e-4)).clamp(0, 1);
  const left = float(1).sub(t);
  return breakM.mul(left.mul(left));
}

/** 0..1 uprush: 1 - (1 - u)^2 over the last `uShoreRiseShare` of the cycle. */
function uprush01(phase: TslNode, wave: WaterWaveUniforms): TslNode {
  const rise = wave.uShoreRiseShare.max(1e-4);
  const u = phase.sub(float(1).sub(rise)).div(rise).clamp(0, 1);
  const left = float(1).sub(u);
  return float(1).sub(left.mul(left));
}

/** 0..1: the swash's height at `phase` of one front: the uprush, then the backwash. */
export function edgePulse(phase: TslNode, wave: WaterWaveUniforms): TslNode {
  const fall = float(1)
    .sub(phase.div(wave.uShoreBackwash.max(1e-4)))
    .clamp(0, 1);
  return max(uprush01(phase, wave), fall.mul(fall));
}

/** 0..1: how high the sand is wet at `phase` of one front: climbs with the uprush, dries over `uShoreDryShare`. */
export function wetPulse(phase: TslNode, wave: WaterWaveUniforms): TslNode {
  const decay = float(1)
    .sub(phase.div(wave.uShoreDryShare.max(1e-4)))
    .clamp(0, 1);
  return max(uprush01(phase, wave), decay);
}

/**
 * Vertical offset (m, + up) of the sea at a point `depthM` deep at the mean level: the swash. 1 x its height at the waterline,
 * fading to 0 deeper than `uShoreSeaW` and on ground higher than the swash can climb. Negative between swashes, when the edge
 * retreats. 0 with shore waves off, and (the `If`) skipped for the open sea. In enclosed water (lakes) the height and the reach
 * are `uLakeSwashShare` of that (the baked lake share, read with an explicit mip level so any branch may call this).
 */
export const waterRunUpTsl = Fn(([worldXZ, depthM]: TslNode[]) => {
  const wave = waterWaveUniforms;
  // enclosed water has a smaller swash (and a shorter reach): the open sea's values times the lake share
  const k = lakeMulTsl(lakeShareTsl(worldXZ), wave.uLakeSwashShare);
  const swashH = wave.uShoreSwashH.mul(k);
  const seaW = wave.uShoreSeaW.mul(k);
  const out = float(0).toVar();
  If(
    wave.uShoreEnabled
      .greaterThan(0.5)
      .and(depthM.lessThan(seaW))
      .and(depthM.greaterThan(swashH.negate())),
    () => {
      const ph = shoreWavePhases(worldXZ, wave);
      const pulse = max(edgePulse(ph.p1, wave), edgePulse(ph.p2, wave));
      const sea = float(1).sub(smoothstep(float(0), seaW, depthM));
      const land = float(1).sub(smoothstep(swashH.mul(0.5), swashH, depthM.negate()));
      out.assign(
        swashH.mul(pulse.sub(wave.uShoreRecede)).mul(swashLobe(worldXZ, wave)).mul(sea).mul(land),
      );
    },
  );
  return out;
});
