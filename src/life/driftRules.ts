// src/life/driftRules.ts — how much of each drifting thing there is (pure: node-runnable)
//
// Each rule gives a share of the field's count, 0..1, from the place, the weather and the time of day. The fields
// themselves (life/particles/driftField.ts) only draw the first share of their particles.

import { life } from '../config/visual/life.ts';
import { clamp01 } from '../core/math/scalar.ts';

export interface DriftWorld {
  /** How wooded the place is, 0..1 (life/habitat.ts). */
  woods01: number;
  /** The wind boost (1 = calm), rain 0..1, night 0..1, golden hour 0..1. */
  windBoost: number;
  rain01: number;
  night01: number;
  golden01: number;
}

const L = life.LEAVES;
const P = life.POLLEN;

/** Leaves in the wind: only near trees, a few in calm weather and a flurry in a gale; fewer in rain and at night. */
export function leafShare(w: DriftWorld): number {
  const gale = clamp01((w.windBoost - 1) / (L.FULL_BOOST - 1));
  const wind = L.CALM_SHARE + (1 - L.CALM_SHARE) * gale;
  const rain = 1 - (1 - L.RAIN_KEEP) * clamp01(w.rain01);
  const night = 1 - (1 - L.NIGHT_KEEP) * clamp01(w.night01);
  return clamp01(w.woods01) * wind * rain * night;
}

/** Pollen in the air: a still, dry day, more over open ground than under trees. */
export function pollenShare(w: DriftWorld): number {
  const day = (1 - clamp01(w.night01)) * (1 - 0.5 * clamp01(w.golden01));
  const still = 1 - clamp01((w.windBoost - 1) / (P.GONE_BOOST - 1));
  const dry = 1 - clamp01(w.rain01 * 3);
  const open = 1 - (1 - P.WOODS_KEEP) * clamp01(w.woods01);
  return clamp01(day * still * dry * open);
}
