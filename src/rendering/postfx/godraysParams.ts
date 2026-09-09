// src/rendering/postfx/godraysParams.ts — occlusion-shaft tunables for PostFX pipeline
import { Color, MathUtils } from 'three';
import { uniform } from 'three/tsl';
import type { TodStopId } from '../../config/visual/tod';
import { VISUAL } from '../../config/visualTuning';
import { sampleTodColor, sampleTodScalar } from '../tod/todBlend';

export type GodraysTintStops = Record<TodStopId, string>;

/** Dev-tunable light shafts (defaults in visualTuning.ts). */
export interface GodraysParams {
  samples: number;
  density: number;
  decay: number;
  exposure: number;
  weightMul: number;
  depthStart: number;
  depthEnd: number;
  sunCore: number;
  sunRadius: number;
  offscreenFade: number;
  elevWeightStartDeg: number;
  elevWeightEndDeg: number;
  weight: Record<TodStopId, number>;
  /** Shaft color per TOD stop (hex); live-blended with todWeights. */
  tint: GodraysTintStops;
}

export function defaultGodraysParams(): GodraysParams {
  const g = VISUAL.godrays;
  return {
    samples: g.SAMPLES,
    density: g.DENSITY,
    decay: g.DECAY,
    exposure: g.EXPOSURE,
    weightMul: g.WEIGHT_MUL,
    depthStart: g.DEPTH_START,
    depthEnd: g.DEPTH_END,
    sunCore: g.SUN_CORE,
    sunRadius: g.SUN_RADIUS,
    offscreenFade: g.OFFSCREEN_FADE,
    elevWeightStartDeg: g.ELEV_WEIGHT_START_DEG,
    elevWeightEndDeg: g.ELEV_WEIGHT_END_DEG,
    weight: { ...g.weight },
    tint: { ...g.tint },
  };
}

/** 0..1 ramp — shafts fade in as the sun clears the geometric horizon. */
export function godraysElevationWeightRamp(elevationDeg: number, params: GodraysParams): number {
  return MathUtils.smoothstep(elevationDeg, params.elevWeightStartDeg, params.elevWeightEndDeg);
}

/**
 * Composite add weight from sun intensity × elevation ramp × tod weight.
 * No min-floor — a dim sun stays dim.
 */
export function godraysBlendWeightForSun(
  intensity: number,
  elevationDeg: number,
  params: GodraysParams,
): number {
  const elevRamp = godraysElevationWeightRamp(elevationDeg, params);
  if (intensity <= 0.001 || elevRamp <= 0) return 0;
  const todMul = sampleTodScalar(params.weight, elevationDeg);
  return Math.min(1, intensity * params.weightMul * elevRamp * todMul);
}

export function sampleGodraysTint(
  tint: GodraysTintStops,
  elevationDeg: number,
  out = new Color(),
): Color {
  return sampleTodColor(tint, elevationDeg, out);
}

export function createGodraysTintUniform(params: GodraysParams) {
  return uniform(new Color(params.tint.noon));
}
