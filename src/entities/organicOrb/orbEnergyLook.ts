// src/entities/organicOrb/orbEnergyLook.ts — the player orb's 0..100% energy ramp (also used by the temple orb)
import { VISUAL } from '../../config/visualTuning';

/** Orb scale at energy `t` (0..1). */
export function orbGrow(t: number): number {
  const min = VISUAL.player.orbScaleMin;
  return min + (1 - min) * t;
}

/** Rim HDR at energy `t`, from `cap` (the organic-orb rim at 100%). */
export function orbRimHdr(t: number, cap: number): number {
  const min = VISUAL.player.orbEmissiveMin;
  return cap * (min + (1 - min) * t);
}

/** Fill white at energy `t`: `cap` is the 100% value. */
export function orbFillWhite(t: number, cap: number): number {
  const min = VISUAL.player.orbFillWhiteMin;
  return min + (cap - min) * t;
}
