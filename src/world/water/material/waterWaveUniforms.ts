// src/world/water/material/waterWaveUniforms.ts — shared tide + water-surface lace uniforms
import { Color } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';

type WaterUniform = any;

export interface WaterWaveUniforms {
  uWaterY: WaterUniform;
  uWaveSpeed: WaterUniform;
  uWaveAmplitude: WaterUniform;
  uTideEnabled: WaterUniform;
  uFoamColor: WaterUniform;
  uFoamWidthM: WaterUniform;
  uFoamRippleAmplitude: WaterUniform;
  uFoamRippleScale: WaterUniform;
  uFoamRippleSpeed: WaterUniform;
  uFoamPatchVariation: WaterUniform;
  uFoamPatchScale: WaterUniform;
  uFoamOpacityMin: WaterUniform;
  uFoamWidthMinRatio: WaterUniform;
  uFoamFogHazeStrength: WaterUniform;
  uFoamFogColorTint: WaterUniform;
  uShoreSlopeStepM: WaterUniform;
  uShoreMaxSlope: WaterUniform;
  uCoastFlattenM: WaterUniform;
  uRunUpM: WaterUniform;
  uRunUpPeriodSec: WaterUniform;
  uWetSandDarken: WaterUniform;
  uWetSandMinM: WaterUniform;
  uWetSandM: WaterUniform;
  uWetSandPhaseLag: WaterUniform;
  /** Mirrors shoreDepth.fogBypassStrength — softer foam haze fade at the coast. */
  uShoreFogBypass: WaterUniform;
}

const tide = VISUAL.water.tide;

export const waterWaveUniforms: WaterWaveUniforms = {
  uWaterY: uniform(0),
  uWaveSpeed: uniform(tide.waveSpeed),
  uWaveAmplitude: uniform(tide.waveAmplitude),
  uTideEnabled: uniform(tide.enabled ? 1 : 0),
  uFoamColor: uniform(new Color(tide.foamColor)),
  uFoamWidthM: uniform(tide.foamWidthM),
  uFoamRippleAmplitude: uniform(tide.foamRippleAmplitude),
  uFoamRippleScale: uniform(tide.foamRippleScale),
  uFoamRippleSpeed: uniform(tide.foamRippleSpeed),
  uFoamPatchVariation: uniform(tide.foamPatchVariation),
  uFoamPatchScale: uniform(tide.foamPatchScale),
  uFoamOpacityMin: uniform(tide.foamOpacityMin),
  uFoamWidthMinRatio: uniform(tide.foamWidthMinRatio),
  uFoamFogHazeStrength: uniform(tide.foamFogHazeStrength),
  uFoamFogColorTint: uniform(tide.foamFogColorTint),
  uShoreSlopeStepM: uniform(tide.shoreSlopeStepM),
  uShoreMaxSlope: uniform(tide.shoreMaxSlope),
  uCoastFlattenM: uniform(tide.coastFlattenM),
  uRunUpM: uniform(tide.runUpM),
  uRunUpPeriodSec: uniform(tide.runUpPeriodSec),
  uWetSandDarken: uniform(tide.wetSandDarken),
  uWetSandMinM: uniform(tide.wetSandMinM),
  uWetSandM: uniform(tide.wetSandM),
  uWetSandPhaseLag: uniform(tide.wetSandPhaseLagRad),
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
