// src/rendering/postfx/godraysParams.ts — occlusion-shaft tunables for PostFX pipeline
import { Color, MathUtils } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { goldenHourT } from '../sky/lightingCurves';

/** Dev-tunable light shafts (defaults in visualTuning.ts). */
export interface GodraysParams {
  samples: number;
  density: number;
  decay: number;
  exposure: number;
  weightMul: number;
  tintR: number;
  tintG: number;
  tintB: number;
  depthStart: number;
  depthEnd: number;
  sunCore: number;
  sunRadius: number;
  offscreenFade: number;
  elevWeightStartDeg: number;
  elevWeightEndDeg: number;
  weightAtNoon: number;
  weightAtGoldenHour: number;
}

export function defaultGodraysParams(): GodraysParams {
  const g = VISUAL.godrays;
  return {
    samples: g.SAMPLES,
    density: g.DENSITY,
    decay: g.DECAY,
    exposure: g.EXPOSURE,
    weightMul: g.WEIGHT_MUL,
    tintR: g.TINT_R,
    tintG: g.TINT_G,
    tintB: g.TINT_B,
    depthStart: g.DEPTH_START,
    depthEnd: g.DEPTH_END,
    sunCore: g.SUN_CORE,
    sunRadius: g.SUN_RADIUS,
    offscreenFade: g.OFFSCREEN_FADE,
    elevWeightStartDeg: g.ELEV_WEIGHT_START_DEG,
    elevWeightEndDeg: g.ELEV_WEIGHT_END_DEG,
    weightAtNoon: g.WEIGHT_AT_NOON,
    weightAtGoldenHour: g.WEIGHT_AT_GOLDEN,
  };
}

/** 0..1 ramp — shafts fade in as the sun clears the geometric horizon. */
export function godraysElevationWeightRamp(elevationDeg: number, params: GodraysParams): number {
  return MathUtils.smoothstep(elevationDeg, params.elevWeightStartDeg, params.elevWeightEndDeg);
}

/**
 * Composite add weight from sun intensity × elevation ramp × golden-hour mul.
 * No min-floor — a dim sun stays dim.
 */
export function godraysBlendWeightForSun(
  intensity: number,
  elevationDeg: number,
  params: GodraysParams,
): number {
  const elevRamp = godraysElevationWeightRamp(elevationDeg, params);
  if (intensity <= 0.001 || elevRamp <= 0) return 0;
  const todMul = MathUtils.lerp(
    params.weightAtNoon,
    params.weightAtGoldenHour,
    goldenHourT(elevationDeg),
  );
  return Math.min(1, intensity * params.weightMul * elevRamp * todMul);
}

export function createGodraysTintUniform(params: GodraysParams) {
  return uniform(new Color(params.tintR, params.tintG, params.tintB));
}
