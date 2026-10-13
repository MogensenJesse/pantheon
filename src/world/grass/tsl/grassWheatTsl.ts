// src/world/grass/tsl/grassWheatTsl.ts — wheat in a field: ordinary grass blades, even height, no clumping, ripening colour
import { clamp, float, mix, smoothstep } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import { WHEAT_FLOOR } from '../data/wheatFieldMask';
import type { TslNode } from './tslNode';

/** Grass weight a wheat field is lifted to, so a field on thin ground still grows dense. */
export const WHEAT_MIN_WEIGHT = 0.95;

/** 0 outside a field, 1 inside; `raw` is the grass data B channel (0..1) as sampled (bilinear at the edge). */
export function wheatMask(raw: TslNode): TslNode {
  return smoothstep(float(WHEAT_FLOOR * 0.25), float(WHEAT_FLOOR * 0.9), raw);
}

/** 0 freshly planted .. 1 ripe. */
export function wheatRipeness(raw: TslNode): TslNode {
  return clamp(raw.sub(WHEAT_FLOOR).div(1 - WHEAT_FLOOR), float(0), float(1));
}

/** Blade scale of wheat: one even height that grows with ripeness, with only a little per-blade jitter. */
export function wheatBladeScale(ripeness: TslNode, noise01: TslNode): TslNode {
  const { uWheatHeightScale, uWheatYoungScale, uWheatHeightJitter } = grassSharedUniforms;
  const grown = mix(uWheatYoungScale, float(1), ripeness);
  const jitter = float(1).add(noise01.sub(0.5).mul(uWheatHeightJitter.mul(2)));
  return uWheatHeightScale.mul(grown).mul(jitter);
}

/** Green when young to gold when ripe, a little variation per blade and paler ears toward the tip. */
export function mixWheatColor(
  bladeHeight: TslNode,
  positionNoise: TslNode,
  ripeness: TslNode,
): TslNode {
  const { uWheatYoungColor, uWheatRipeColor, uWheatTipColor } = grassSharedUniforms;
  const body = mix(uWheatYoungColor, uWheatRipeColor, ripeness).mul(
    float(0.88).add(positionNoise.mul(0.24)),
  );
  const tip = smoothstep(float(0.3), float(1), bladeHeight).mul(float(0.2).add(ripeness.mul(0.5)));
  return mix(body, uWheatTipColor, tip);
}
