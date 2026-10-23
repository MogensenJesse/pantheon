// src/world/grass/wind/plantWind.ts — how wheat and plants near the orb move (pure: node-runnable)
//
// The CPU twin of the shader maths in `world/grass/tsl/grassWindTsl.ts` and the flower material: the same numbers on
// plain values, so a check can prove what the shaders must do. Keep them in step.

import { life } from '../../../config/visual/life.ts';
import { smoothstep01, TAU } from '../../../core/math/scalar.ts';

const W = life.WHEAT_WIND;

interface WheatWindInput {
  /** The wind's lean (x, z) before the field shapes it, a unit direction, and the wheat mask (0..1). */
  windX: number;
  windZ: number;
  dirX: number;
  dirZ: number;
  mask: number;
  /** Where (x, z) the blade stands, the wind clock (s) and the wet ground (0..1). */
  x: number;
  z: number;
  clockS: number;
  wetness: number;
}

/** The wave of a wheat field at a place, -0.5..0.5: it travels along the wind. */
export function wheatWave(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  clockS: number,
): number {
  const along = x * dirX + z * dirZ;
  return Math.sin((along * TAU) / W.WAVE_LENGTH_M - (clockS * TAU) / W.WAVE_PERIOD_S) * 0.5;
}

/**
 * The wind lean a wheat blade is given: the wind modulated by the wave, a breeze that always rolls through,
 * and the lean of a field that rain has lain down. A blade outside a field (mask 0) gets the wind unchanged.
 */
export function wheatWind(i: WheatWindInput): { x: number; z: number } {
  const wave = wheatWave(i.x, i.z, i.dirX, i.dirZ, i.clockS);
  const gain = 1 + W.WAVE_GAIN * wave * i.mask;
  const breeze = (wave + 0.5) * W.WAVE_BASE * i.mask;
  const lodge = W.LODGE_LEAN * i.wetness * i.mask;
  return {
    x: i.windX * gain + i.dirX * (breeze + lodge),
    z: i.windZ * gain + i.dirZ * (breeze + lodge),
  };
}

/** How near the orb a plant is, 1 at the orb falling smoothly to 0 at `radiusM`. */
export function orbNear(distM: number, radiusM: number): number {
  return 1 - smoothstep01(distM / radiusM);
}
