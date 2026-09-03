// src/world/water/sync/syncWaterWaveUniforms.ts — live DEV tide + shore foam drive
import { Color } from 'three';
import { runtimeSettings } from '../../../core/GameState';
import { waterWaveUniforms } from '../material/waterWaveUniforms';

const _foamColor = new Color();
let lastFoamHex = '';

export function syncWaterWaveUniforms(): void {
  const t = runtimeSettings.water.tide;
  waterWaveUniforms.uWaveSpeed.value = t.waveSpeed;
  waterWaveUniforms.uWaveAmplitude.value = t.waveAmplitude;
  waterWaveUniforms.uTideEnabled.value = t.enabled ? 1 : 0;
  waterWaveUniforms.uFoamWidthM.value = t.foamWidthM;
  waterWaveUniforms.uFoamRippleAmplitude.value = t.foamRippleAmplitude;
  waterWaveUniforms.uFoamRippleScale.value = t.foamRippleScale;
  waterWaveUniforms.uFoamRippleSpeed.value = t.foamRippleSpeed;
  waterWaveUniforms.uFoamPatchVariation.value = t.foamPatchVariation;
  waterWaveUniforms.uFoamPatchScale.value = t.foamPatchScale;
  waterWaveUniforms.uFoamOpacityMin.value = t.foamOpacityMin;
  waterWaveUniforms.uFoamWidthMinRatio.value = t.foamWidthMinRatio;
  waterWaveUniforms.uShoreSlopeStepM.value = t.shoreSlopeStepM;
  waterWaveUniforms.uShoreMaxSlope.value = t.shoreMaxSlope;
  waterWaveUniforms.uCoastFlattenM.value = t.coastFlattenM;
  waterWaveUniforms.uRunUpM.value = t.runUpM;
  waterWaveUniforms.uRunUpPeriodSec.value = t.runUpPeriodSec;
  waterWaveUniforms.uWetSandDarken.value = t.wetSandDarken;
  waterWaveUniforms.uWetSandMinM.value = t.wetSandMinM;
  waterWaveUniforms.uWetSandM.value = t.wetSandM;
  waterWaveUniforms.uWetSandPhaseLag.value = t.wetSandPhaseLagRad;
  waterWaveUniforms.uShoreFogBypass.value = runtimeSettings.water.shoreDepth.fogBypassStrength;
  if (t.foamColor !== lastFoamHex) {
    _foamColor.set(t.foamColor);
    (waterWaveUniforms.uFoamColor.value as Color).copy(_foamColor);
    lastFoamHex = t.foamColor;
  }
}
