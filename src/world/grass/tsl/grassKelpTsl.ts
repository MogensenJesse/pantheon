// src/world/grass/tsl/grassKelpTsl.ts — kelp on the sea floor: ordinary grass blades, longer, wider, slow sway, kelp colours
import { float, min, mix, sin, smoothstep, vec2 } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/** A blade never reaches higher than this share of the water over it. */
const MAX_DEPTH_SHARE = 0.75;

/** 0 off kelp, 1 on it; `raw` is the grass data A channel (0..1) as sampled (bilinear at a patch's rim). */
export function kelpMask(raw: TslNode): TslNode {
  return smoothstep(float(0.1), float(0.4), raw);
}

/** Blade scale of kelp: its own length range, capped under the grass's blade bound and by the water over it. */
export function kelpBladeScale(depthM: TslNode, noise01: TslNode): TslNode {
  const { uKelpHeightMin, uKelpHeightMax, uBladeHeight, uBladeMaxScale } = grassSharedUniforms;
  const scale = mix(uKelpHeightMin, uKelpHeightMax, noise01).div(uBladeHeight);
  return min(min(scale, uBladeMaxScale), depthM.mul(MAX_DEPTH_SHARE).div(uBladeHeight));
}

/** The lean (xz, metres at the tip) of kelp in the water: a slow swell along the wind's direction, with a little across. */
export function kelpSwayXZ(worldPos: TslNode, bladeSeed: TslNode): TslNode {
  const { uWindDirection, uWindClock, uKelpSwayM, uKelpSwayOmega } = grassSharedUniforms;
  const phase = worldPos.x.mul(0.31).add(worldPos.z.mul(0.23)).add(bladeSeed.mul(2.2));
  const along = sin(uWindClock.mul(uKelpSwayOmega).add(phase));
  const across = sin(uWindClock.mul(uKelpSwayOmega.mul(0.63)).add(phase.mul(1.7))).mul(0.5);
  const perp = vec2(uWindDirection.y.negate(), uWindDirection.x);
  return uWindDirection.mul(along).add(perp.mul(across)).mul(uKelpSwayM);
}

/** Dark at the root to bright toward the tip, a little variation per blade. */
export function mixKelpColor(bladeHeight: TslNode, positionNoise: TslNode): TslNode {
  const { uKelpColorA, uKelpColorB } = grassSharedUniforms;
  const tip = smoothstep(float(0.05), float(0.9), bladeHeight).mul(positionNoise.mul(0.4).add(0.6));
  return mix(uKelpColorA, uKelpColorB, tip);
}
