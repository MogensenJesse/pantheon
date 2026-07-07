// src/world/water/waterWaveUniforms.ts — shared tide + shore foam uniforms (water + terrain)
import { Color } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

type WaterUniform = any;

export interface WaterWaveUniforms {
  uWaterY: WaterUniform;
  uWaveSpeed: WaterUniform;
  uWaveAmplitude: WaterUniform;
  uFoamDepth: WaterUniform;
  uTideEnabled: WaterUniform;
  uFoamColor: WaterUniform;
  uFoamRippleAmplitude: WaterUniform;
  uFoamRippleScale: WaterUniform;
  uFoamRippleSpeed: WaterUniform;
  uFoamPatchVariation: WaterUniform;
  uFoamPatchScale: WaterUniform;
  uFoamOpacityMin: WaterUniform;
  uFoamDepthMinRatio: WaterUniform;
  uFoamFogHazeStrength: WaterUniform;
  uFoamFogColorTint: WaterUniform;
  uFoamWaterlineBias: WaterUniform;
  /** Mirrors shoreDepth.fogBypassStrength — softer foam haze fade at the coast. */
  uShoreFogBypass: WaterUniform;
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

/** Map editor — static water level reference, no tidal bob or shore foam stripe. */
export function initWaterWaveEditorPreview(waterY: number): void {
  waterWaveUniforms.uWaterY.value = waterY;
  waterWaveUniforms.uTideEnabled.value = 0;
}
