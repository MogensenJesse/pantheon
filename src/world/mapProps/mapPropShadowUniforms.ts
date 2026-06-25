// src/world/mapProps/mapPropShadowUniforms.ts — shared lighting uniforms for map prop materials
import type { DirectionalLight } from 'three';
import { Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import {
  createSunShadowNode,
  PROP_SHADOW_FLOOR_DEFAULT,
  type SunShadowNode,
} from '../../rendering/sunShadow';

const p = VISUAL.props;

export { PROP_SHADOW_FLOOR_DEFAULT };

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

/** @deprecated Use createSunShadowNode from rendering/sunShadow. */
export function getPropSunShadow(sun: DirectionalLight): SunShadowNode {
  return createSunShadowNode(sun);
}
