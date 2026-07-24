// src/world/mapProps/config/mapPropShadowUniforms.ts — shared lighting uniforms for map prop materials
import { Color, DataTexture, FloatType, RedFormat, Vector3 } from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { propSunReceiverUniforms } from '../../../rendering/sunShadow/receiverUniforms';

const p = VISUAL.props;
const fl = p.foliageLighting;
const gc = p.groundContact;

type UniformNode = ReturnType<typeof uniform>;

const _placeholderHeight = new DataTexture(new Float32Array([0]), 1, 1, RedFormat, FloatType);
_placeholderHeight.needsUpdate = true;

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
  /** Tree leaves/needles only — 0 = hardened cutout; 1 = full hashed alpha. */
  uHashedAlphaStrength: UniformNode;
  uGroundContactEnabled: UniformNode;
  uHeightTex: ReturnType<typeof texture>;
  uWorldSize: UniformNode;
  uHeightScale: UniformNode;
  uFadeHeightM: UniformNode;
  uDarkenMax: UniformNode;
  uTintStrength: UniformNode;
  uBarkContactStrength: UniformNode;
  uFoliageContactStrength: UniformNode;
  uDefaultContactStrength: UniformNode;
}

export const propShadowUniforms: PropShadowUniforms = {
  uShadowFloor: propSunReceiverUniforms.uShadowFloor,
  uSunIntensity: propSunReceiverUniforms.uSunIntensity,
  uSunDirection: propSunReceiverUniforms.uSunDirection,
  uDaylight: propSunReceiverUniforms.uDaylight,
  uNightSkyDaylight: uniform(VISUAL.sky.lightingCurve.nightDaylightFloor),
  uNightColorFloor: uniform(p.nightColorFloor),
  uShadowStrength: uniform(p.shadowStrength),
  uShadowSmoothMin: uniform(p.shadowSmoothMin),
  uShadowSmoothMax: uniform(p.shadowSmoothMax),
  uPlayerPosition: propSunReceiverUniforms.uPlayerPosition,
  uLightRadius: propSunReceiverUniforms.uLightRadius,
  uLightIntensity: propSunReceiverUniforms.uLightIntensity,
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
  uHashedAlphaStrength: uniform(VISUAL.props.hashedAlphaStrength),
  uGroundContactEnabled: uniform(gc.enabled ? 1 : 0),
  uHeightTex: texture(_placeholderHeight),
  uWorldSize: uniform(0),
  uHeightScale: uniform(0),
  uFadeHeightM: uniform(gc.fadeHeightM),
  uDarkenMax: uniform(gc.darkenMax),
  uTintStrength: uniform(gc.tintStrength),
  uBarkContactStrength: uniform(gc.barkStrength),
  uFoliageContactStrength: uniform(gc.foliageStrength),
  uDefaultContactStrength: uniform(gc.defaultStrength),
};

export type PropMaterialCategory = 'foliage' | 'bark' | 'default';

export interface PropMaterialClass {
  category: PropMaterialCategory;
  /** Flower/plant cards — fixed 0.2 alphaTest; tree leaves use live uAlphaTest. */
  isSoftFoliage: boolean;
}

/** Single name-based classifier for wrap/hemi mul, ground contact, and alpha cutout. */
export function classifyPropMaterial(name: string | undefined): PropMaterialClass {
  const n = (name ?? '').toLowerCase();
  const isSoftFoliage =
    n.includes('flower') ||
    n.includes('petal') ||
    n.includes('plant') ||
    n.includes('bush') ||
    n.includes('clover') ||
    n.includes('mushroom');

  if (isSoftFoliage) {
    return { category: 'foliage', isSoftFoliage: true };
  }
  if (n.includes('leaves') || n.includes('leaf') || n.includes('needle')) {
    return { category: 'foliage', isSoftFoliage: false };
  }
  if (n.includes('bark') || n.includes('trunk')) {
    return { category: 'bark', isSoftFoliage: false };
  }
  return { category: 'default', isSoftFoliage: false };
}

/** Per-material category scale — leaves / bark / default (baked at material build). */
export function propCategoryMulFromClass({ category }: PropMaterialClass): UniformNode {
  switch (category) {
    case 'foliage':
      return propShadowUniforms.uFoliageMul;
    case 'bark':
      return propShadowUniforms.uBarkMul;
    case 'default':
      return propShadowUniforms.uDefaultMul;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

/** Per-material ground-contact strength — bark / foliage / default. */
export function propGroundContactMulFromClass({ category }: PropMaterialClass): UniformNode {
  switch (category) {
    case 'foliage':
      return propShadowUniforms.uFoliageContactStrength;
    case 'bark':
      return propShadowUniforms.uBarkContactStrength;
    case 'default':
      return propShadowUniforms.uDefaultContactStrength;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}
