// src/rendering/clouds/volumetric/volumetricCloudDevState.ts — DEV live volumetric cloud tunables
import { VISUAL } from '../../../config/visualTuning';
import type { CloudSettings } from '../cloudConfig';
import { getLiveCloudSettings } from '../cloudDevState';
import type { CloudDensityUniforms } from './cloudDensityTsl';
import type { CloudRaymarchUniforms } from './cloudRaymarchTsl';

export interface VolumetricCloudParams {
  enabled: boolean;
  passResolutionScale: number;
  marchJitter: number;
  baseLiftM: number;
  topMarginM: number;
  slabFadeM: number;
  radiusSpreadMul: number;
  radialFadeSpreadMul: number;
  coverage: number;
  detailStrength: number;
  shapeScale: number;
  detailScale: number;
  maxSteps: number;
  marchShapeOctaves: number;
  marchDetailOctaves: number;
  marchDensityPow: number;
  marchIntegrationScale: number;
  debugShapeOctaves: number;
  absorption: number;
}

let devOverrides: Partial<VolumetricCloudParams> = {};

export function defaultVolumetricCloudParams(): VolumetricCloudParams {
  return { ...VISUAL.clouds.volumetric };
}

/** Shipped VISUAL.clouds.volumetric merged with DEV overrides. */
export function getLiveVolumetricCloudParams(): VolumetricCloudParams {
  const base = defaultVolumetricCloudParams();
  if (!import.meta.env.DEV || Object.keys(devOverrides).length === 0) return base;
  return { ...base, ...devOverrides };
}

export function setVolumetricCloudParams(params: Partial<VolumetricCloudParams>): void {
  if (!import.meta.env.DEV) return;
  devOverrides = { ...devOverrides, ...params };
}

export function resetVolumetricCloudParams(): void {
  devOverrides = {};
}

/** @deprecated Use getVolumetricPipelineRebuildKey from volumetricCloudRuntime.ts */
export function getVolumetricShaderRebuildKey(): string {
  const p = getLiveVolumetricCloudParams();
  return `${p.maxSteps}|${p.marchShapeOctaves}|${p.marchDetailOctaves}|${p.debugShapeOctaves}`;
}

export function applyVolumetricCloudDevUniforms(
  density: CloudDensityUniforms,
  raymarch: CloudRaymarchUniforms,
  cloudSettings: CloudSettings = getLiveCloudSettings(),
): void {
  const p = getLiveVolumetricCloudParams();
  const cloudBaseY = cloudSettings.cloudBaseY + p.baseLiftM;
  const cloudTopY = cloudSettings.cloudBaseY + cloudSettings.altitudeJitter + p.topMarginM;

  density.uCloudBaseY.value = cloudBaseY;
  density.uCloudTopY.value = cloudTopY;
  density.uSlabFadeM.value = p.slabFadeM;
  density.uCloudSpread.value = cloudSettings.spread;
  density.uCloudRadius.value = cloudSettings.spread * p.radiusSpreadMul;
  density.uCloudRadialFade.value = cloudSettings.spread * p.radialFadeSpreadMul;
  density.uCoverage.value = p.coverage;
  density.uDetailStrength.value = p.detailStrength;
  density.uShapeScale.value = p.shapeScale;
  density.uDetailScale.value = p.detailScale;
  density.uMarchDensityPow.value = p.marchDensityPow;
  density.uMarchIntegrationScale.value = p.marchIntegrationScale;

  raymarch.uAbsorption.value = p.absorption;
  raymarch.uMarchJitter.value = p.marchJitter;
}
