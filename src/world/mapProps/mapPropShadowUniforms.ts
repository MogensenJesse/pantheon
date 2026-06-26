// src/world/mapProps/mapPropShadowUniforms.ts — shared lighting uniforms for map prop materials
import { Color, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { PROP_SHADOW_FLOOR_DEFAULT } from '../../rendering/sunShadow';

const p = VISUAL.props;
const fl = p.foliageLighting;

type UniformNode = ReturnType<typeof uniform>;

export interface PropShadowUniforms {
  uShadowFloor: UniformNode;
  uSunIntensity: UniformNode;
  uSunDirection: { value: Vector3 };
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
  uWrapStrength: UniformNode;
  uHemisphereStrength: UniformNode;
  uVertexColorMul: UniformNode;
  uFoliageMul: UniformNode;
  uBarkMul: UniformNode;
  uDefaultMul: UniformNode;
  uSkyTint: { value: Color };
  uGroundTint: { value: Color };
  /** Leaf MASK cutoff — live-tuned in dev panel (Props shading). */
  uAlphaTest: UniformNode;
  uAlphaCutoffSharpness: UniformNode;
}

export const propShadowUniforms: PropShadowUniforms = {
  uShadowFloor: uniform(PROP_SHADOW_FLOOR_DEFAULT),
  uSunIntensity: uniform(0),
  uSunDirection: uniform(new Vector3(0.55, 0.75, 0.45).normalize()),
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
  uWrapStrength: uniform(fl.wrapStrength),
  uHemisphereStrength: uniform(fl.hemisphereStrength),
  uVertexColorMul: uniform(fl.vertexColorMul),
  uFoliageMul: uniform(fl.foliageMul),
  uBarkMul: uniform(fl.barkMul),
  uDefaultMul: uniform(fl.defaultMul),
  uSkyTint: uniform(new Color(fl.skyTint)),
  uGroundTint: uniform(new Color(fl.groundTint)),
  uAlphaTest: uniform(VISUAL.props.alphaTest),
  uAlphaCutoffSharpness: uniform(VISUAL.props.alphaCutoffSharpness),
};

/** Per-material category scale — leaves / bark / default (baked at material build). */
export function propCategoryMulUniform(material: { name?: string }): UniformNode {
  const name = (material.name ?? '').toLowerCase();
  if (name.includes('leaves') || name.includes('leaf') || name.includes('needle')) {
    return propShadowUniforms.uFoliageMul;
  }
  if (name.includes('bark') || name.includes('trunk')) {
    return propShadowUniforms.uBarkMul;
  }
  return propShadowUniforms.uDefaultMul;
}
