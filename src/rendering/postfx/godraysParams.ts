// src/rendering/postfx/godraysParams.ts — god-ray tunables for PostFX pipeline
import { Color } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import type { GodraysMaskUniforms } from './godraysMask';

/** Dev-tunable god rays / light shafts (defaults in visualTuning.ts). */
export interface GodraysParams {
  densityBase: number;
  maxDensityBase: number;
  intensityMul: number;
  weightMin: number;
  weightMax: number;
  tintR: number;
  tintG: number;
  tintB: number;
  edgeRadius: number;
  edgeStrength: number;
  skyLumaStart: number;
  skyLumaEnd: number;
  sunFacingMin: number;
  sunFacingMax: number;
  sunIntensityRef: number;
  elevRayFalloff: number;
  elevFactorMin: number;
  elevFactorMax: number;
}

export function defaultGodraysParams(): GodraysParams {
  const g = VISUAL.godrays;
  return {
    densityBase: g.DENSITY_BASE,
    maxDensityBase: g.MAX_DENSITY_BASE,
    intensityMul: g.INTENSITY_MUL,
    weightMin: g.WEIGHT_MIN,
    weightMax: g.WEIGHT_MAX,
    tintR: g.TINT_R,
    tintG: g.TINT_G,
    tintB: g.TINT_B,
    edgeRadius: g.EDGE_RADIUS,
    edgeStrength: g.EDGE_STRENGTH,
    skyLumaStart: g.SKY_LUMA_START,
    skyLumaEnd: g.SKY_LUMA_END,
    sunFacingMin: g.SUN_FACING_MIN,
    sunFacingMax: g.SUN_FACING_MAX,
    sunIntensityRef: g.SUN_INTENSITY_REF,
    elevRayFalloff: g.ELEV_RAY_FALLOFF,
    elevFactorMin: g.ELEV_FACTOR_MIN,
    elevFactorMax: g.ELEV_FACTOR_MAX,
  };
}

export interface GodraysBlendUniforms {
  uBlendColor: { value: Color };
  uEdgeRadius: { value: number };
  uEdgeStrength: { value: number };
}

export function createGodraysBlendUniforms(params: GodraysParams): GodraysBlendUniforms {
  return {
    uBlendColor: uniform(new Color(params.tintR, params.tintG, params.tintB)),
    uEdgeRadius: uniform(Math.round(params.edgeRadius)),
    uEdgeStrength: uniform(params.edgeStrength),
  };
}

export function applyGodraysTunables(
  params: GodraysParams,
  blend: GodraysBlendUniforms,
  maskUniforms: GodraysMaskUniforms,
): void {
  blend.uBlendColor.value.set(params.tintR, params.tintG, params.tintB);
  blend.uEdgeRadius.value = Math.round(params.edgeRadius);
  blend.uEdgeStrength.value = params.edgeStrength;
  maskUniforms.skyLumaStart.value = params.skyLumaStart;
  maskUniforms.skyLumaEnd.value = params.skyLumaEnd;
  maskUniforms.sunFacingMin.value = params.sunFacingMin;
  maskUniforms.sunFacingMax.value = params.sunFacingMax;
}
