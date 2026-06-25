// src/world/mapProps/mapPropShadowUniforms.ts — shared lighting uniforms for map prop materials
import { Vector3 } from 'three';
import { shadow, uniform } from 'three/tsl';
import type { DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';

const p = VISUAL.props;

export const PROP_SHADOW_FLOOR_DEFAULT = p.shadowFloor;

type UniformNode = ReturnType<typeof uniform>;

export interface PropShadowUniforms {
  uShadowFloor: UniformNode;
  uSunIntensity: UniformNode;
  uDaylight: UniformNode;
  uNightSkyDaylight: UniformNode;
  uNightColorFloor: UniformNode;
  uShadowStrength: UniformNode;
  uShadowSmoothMin: UniformNode;
  uShadowSmoothMax: UniformNode;
  uPlayerPosition: { value: Vector3 };
  uLightRadius: UniformNode;
  uLightIntensity: UniformNode;
  uPlayerGlowMul: UniformNode;
}

export const propShadowUniforms: PropShadowUniforms = {
  uShadowFloor: uniform(p.shadowFloor),
  uSunIntensity: uniform(0),
  uDaylight: uniform(VISUAL.sky.lightingCurve.nightDaylightFloor),
  uNightSkyDaylight: uniform(VISUAL.sky.lightingCurve.nightDaylightFloor),
  uNightColorFloor: uniform(p.nightColorFloor),
  uShadowStrength: uniform(p.shadowStrength),
  uShadowSmoothMin: uniform(p.shadowSmoothMin),
  uShadowSmoothMax: uniform(p.shadowSmoothMax),
  uPlayerPosition: uniform(new Vector3()),
  uLightRadius: uniform(6),
  uLightIntensity: uniform(2.2),
  uPlayerGlowMul: uniform(p.playerGlowMul),
};

let propSunShadow: ReturnType<typeof shadow> | null = null;

/** One shadow(sun) node shared across all map prop materials. */
export function getPropSunShadow(sun: DirectionalLight) {
  if (!propSunShadow) {
    propSunShadow = shadow(sun);
  }
  return propSunShadow;
}
