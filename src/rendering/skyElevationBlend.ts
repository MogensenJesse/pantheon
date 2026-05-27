// src/rendering/skyElevationBlend.ts — blend atmosphere presets by sun elevation
import { MathUtils } from 'three';
import type { PostFXContext } from './PostFX';
import type { SkyParams, SkySystemContext } from './SkySystem';
import { SKY_DEFAULTS } from './skyDefaults';

/** Sunset / dawn look (reference elevation 1°). */
export const SKY_ATMOSPHERE_LOW = {
  elevationDeg: 1,
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  exposure: 0.6,
  cloudCoverage: 0,
} as const;

/** High sun / midday look (reference elevation 60°). */
export const SKY_ATMOSPHERE_HIGH = {
  elevationDeg: 60,
  turbidity: 1.5,
  rayleigh: 1,
  mieCoefficient: 0.002,
  mieDirectionalG: 0.92,
  exposure: 0.6,
  cloudCoverage: 0,
} as const;

export type BlendedSkyAtmosphere = SkyParams & { exposure: number };

const _blendSpan =
  SKY_ATMOSPHERE_HIGH.elevationDeg - SKY_ATMOSPHERE_LOW.elevationDeg;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth 0–1 blend weight from sun elevation (clamped below/above reference elevations). */
export function skyAtmosphereBlendT(elevationDeg: number): number {
  const linear = (elevationDeg - SKY_ATMOSPHERE_LOW.elevationDeg) / _blendSpan;
  return MathUtils.smoothstep(0, 1, MathUtils.clamp(linear, 0, 1));
}

export function blendSkyAtmosphere(elevationDeg: number): BlendedSkyAtmosphere {
  const t = skyAtmosphereBlendT(elevationDeg);
  const low = SKY_ATMOSPHERE_LOW;
  const high = SKY_ATMOSPHERE_HIGH;

  return {
    turbidity: lerp(low.turbidity, high.turbidity, t),
    rayleigh: lerp(low.rayleigh, high.rayleigh, t),
    mieCoefficient: lerp(low.mieCoefficient, high.mieCoefficient, t),
    mieDirectionalG: lerp(low.mieDirectionalG, high.mieDirectionalG, t),
    exposure: lerp(low.exposure, high.exposure, t),
    cloudCoverage: lerp(low.cloudCoverage, high.cloudCoverage, t),
    cloudDensity: SKY_DEFAULTS.cloudDensity,
    cloudElevation: SKY_DEFAULTS.cloudElevation,
    showSunDisc: SKY_DEFAULTS.showSunDisc,
    fogDensity: SKY_DEFAULTS.fogDensity,
  };
}

export function applySkyAtmosphereForElevation(
  sky: SkySystemContext,
  postFX: PostFXContext,
  elevationDeg: number,
): BlendedSkyAtmosphere {
  const params = blendSkyAtmosphere(elevationDeg);
  sky.setSkyParams(params);
  postFX.setBloomParams({ exposure: params.exposure });
  return params;
}
