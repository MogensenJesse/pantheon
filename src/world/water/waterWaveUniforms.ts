// src/world/water/waterWaveUniforms.ts — shared tide + shore foam uniforms (water + terrain)
import { Color } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

export interface WaterWaveUniforms {
  uWaterY: ReturnType<typeof uniform>;
  uWaveSpeed: ReturnType<typeof uniform>;
  uWaveAmplitude: ReturnType<typeof uniform>;
  uFoamDepth: ReturnType<typeof uniform>;
  uTideEnabled: ReturnType<typeof uniform>;
  uFoamColor: ReturnType<typeof uniform>;
  uFoamRippleAmplitude: ReturnType<typeof uniform>;
  uFoamRippleScale: ReturnType<typeof uniform>;
  uFoamRippleSpeed: ReturnType<typeof uniform>;
  uFoamPatchVariation: ReturnType<typeof uniform>;
  uFoamPatchScale: ReturnType<typeof uniform>;
  uFoamOpacityMin: ReturnType<typeof uniform>;
  uFoamDepthMinRatio: ReturnType<typeof uniform>;
  uFoamFogHazeStrength: ReturnType<typeof uniform>;
  uFoamFogColorTint: ReturnType<typeof uniform>;
  uFoamWaterlineBias: ReturnType<typeof uniform>;
  /** Mirrors shoreDepth.fogBypassStrength — softer foam haze fade at the coast. */
  uShoreFogBypass: ReturnType<typeof uniform>;
}

const tide = VISUAL.water.tide;

export const waterWaveUniforms: WaterWaveUniforms = {
  uWaterY: uniform(0),
  uWaveSpeed: uniform(tide.waveSpeed),
  uWaveAmplitude: uniform(tide.waveAmplitude),
  uFoamDepth: uniform(tide.foamDepth),
  uTideEnabled: uniform(tide.enabled ? 1 : 0),
  uFoamColor: uniform(new Color(tide.foamColor)),
  uFoamRippleAmplitude: uniform(tide.foamRippleAmplitude),
  uFoamRippleScale: uniform(tide.foamRippleScale),
  uFoamRippleSpeed: uniform(tide.foamRippleSpeed),
  uFoamPatchVariation: uniform(tide.foamPatchVariation),
  uFoamPatchScale: uniform(tide.foamPatchScale),
  uFoamOpacityMin: uniform(tide.foamOpacityMin),
  uFoamDepthMinRatio: uniform(tide.foamDepthMinRatio),
  uFoamFogHazeStrength: uniform(tide.foamFogHazeStrength),
  uFoamFogColorTint: uniform(tide.foamFogColorTint),
  uFoamWaterlineBias: uniform(tide.foamWaterlineBias),
  uShoreFogBypass: uniform(VISUAL.water.shoreDepth.fogBypassStrength),
};

/** Set once at play init — same world Y as shore-depth uWaterY. */
export function initWaterWaveUniforms(waterY: number): void {
  waterWaveUniforms.uWaterY.value = waterY;
}
