// @ts-nocheck — TSL node typings incomplete in three r186
// src/rendering/weather/weatherLookTsl.ts — the wet-ground look, one uniform shared by terrain, props and grass
import { dot, Fn, float, mix, uniform, vec3 } from 'three/tsl';
import { WEATHER } from '../../config/weather';
import type { TslNode } from '../../world/grass/tsl/tslNode';

const LOOK = WEATHER.LOOK;

/** Wet ground 0..1, written each frame by `weatherView`. */
export const uWetness = uniform(0);

/** Wet ground is darker and a little richer in colour; a no-op at wetness 0. */
const wetLook = Fn(([color]) => {
  const luma = dot(color, vec3(0.299, 0.587, 0.114));
  const richer = mix(vec3(luma), color, float(1).add(uWetness.mul(LOOK.WET_SATURATE)));
  return richer.mul(float(1).sub(uWetness.mul(LOOK.WET_DARKEN)));
});

export const applyWetLookTsl = wetLook as unknown as (color: TslNode) => TslNode;
