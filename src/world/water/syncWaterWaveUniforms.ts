// src/world/water/syncWaterWaveUniforms.ts — live DEV tide + shore foam drive
import { Color } from 'three';
import { runtimeSettings } from '../../core/GameState';
import { waterWaveUniforms } from './waterWaveUniforms';

const _foamColor = new Color();
let lastFoamHex = '';

export function syncWaterWaveUniforms(): void {
  const t = runtimeSettings.water.tide;
  waterWaveUniforms.uWaveSpeed.value = t.waveSpeed;
  waterWaveUniforms.uWaveAmplitude.value = t.waveAmplitude;
  waterWaveUniforms.uFoamDepth.value = t.foamDepth;
  waterWaveUniforms.uTideEnabled.value = t.enabled ? 1 : 0;
  waterWaveUniforms.uFoamRippleAmplitude.value = t.foamRippleAmplitude;
  waterWaveUniforms.uFoamRippleScale.value = t.foamRippleScale;
  waterWaveUniforms.uFoamRippleSpeed.value = t.foamRippleSpeed;
  waterWaveUniforms.uFoamPatchVariation.value = t.foamPatchVariation;
  waterWaveUniforms.uFoamPatchScale.value = t.foamPatchScale;
  waterWaveUniforms.uFoamOpacityMin.value = t.foamOpacityMin;
  waterWaveUniforms.uFoamDepthMinRatio.value = t.foamDepthMinRatio;
  waterWaveUniforms.uFoamFogHazeStrength.value = t.foamFogHazeStrength;
  waterWaveUniforms.uFoamFogColorTint.value = t.foamFogColorTint;
  waterWaveUniforms.uFoamWaterlineBias.value = t.foamWaterlineBias;
  waterWaveUniforms.uShoreFogBypass.value = runtimeSettings.water.shoreDepth.fogBypassStrength;
  if (t.foamColor !== lastFoamHex) {
    _foamColor.set(t.foamColor);
    (waterWaveUniforms.uFoamColor.value as Color).copy(_foamColor);
    lastFoamHex = t.foamColor;
  }
}
