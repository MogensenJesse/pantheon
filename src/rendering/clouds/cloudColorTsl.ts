// src/rendering/clouds/cloudColorTsl.ts — elevation-driven cloud sun/ambient/tint + visibility
import { Color, MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { getActiveLightingSample } from '../sky/lightingCurves';
import { sampleTodColor, todWeights } from '../tod/todBlend';
import { getActiveCloudPalette } from '../tod/todDevOverrides';
import type { CloudSettings } from './cloudConfig';
import { getLiveCloudSettings } from './cloudDevState';

export interface CloudColorSample {
  sunColor: Color;
  ambientColor: Color;
  cloudTint: Color;
}

export interface CloudVisibilityParams {
  elevationDeg: number;
  daylightFactor: number;
  hdriWeight: number;
  atmosphereBlendT: number;
}

export interface CloudLitSample {
  colors: CloudColorSample;
  opacity: number;
  /** Multiplies wrap/SSS lit term in the shader (world light cohesion). */
  lightScale: number;
}

const _sun = new Color();
const _ambient = new Color();
const _tint = new Color();

/**
 * Cloud lighting colors from shared todWeights (night / golden / noon palette).
 */
export function sampleCloudColors(
  elevationDeg: number,
  out: CloudColorSample = { sunColor: _sun, ambientColor: _ambient, cloudTint: _tint },
  _settings: CloudSettings = getLiveCloudSettings(),
): CloudColorSample {
  const palette = getActiveCloudPalette();
  sampleTodColor(
    { night: palette.night.sun, goldenHour: palette.goldenHour.sun, noon: palette.noon.sun },
    elevationDeg,
    out.sunColor,
  );
  sampleTodColor(
    {
      night: palette.night.ambient,
      goldenHour: palette.goldenHour.ambient,
      noon: palette.noon.ambient,
    },
    elevationDeg,
    out.ambientColor,
  );
  sampleTodColor(
    { night: palette.night.tint, goldenHour: palette.goldenHour.tint, noon: palette.noon.tint },
    elevationDeg,
    out.cloudTint,
  );
  return out;
}

/**
 * Master opacity multiplier — energy/atmosphere reveal ramp only.
 * Daylight and night HDRI no longer zero alpha (real clouds stay visible at night);
 * night look comes from the elevation color palette + lightScale instead.
 */
export function computeCloudOpacityMultiplier(params: CloudVisibilityParams): number {
  const settings = getLiveCloudSettings();
  return MathUtils.lerp(
    settings.revealMinCoverage,
    settings.revealMaxCoverage,
    MathUtils.clamp(params.atmosphereBlendT, 0, 1),
  );
}

export function computeCloudOpacity(
  params: CloudVisibilityParams,
  settings = getLiveCloudSettings(),
): number {
  const mul = computeCloudOpacityMultiplier(params);
  return settings.opacity * MathUtils.clamp(mul, 0, 1);
}

/**
 * Scale palette by world lighting while keeping directional sun readable at dawn/dusk.
 * Ambient (shadowed side) tracks world intensity; sun (lit face) gets a catch-light lift
 * so N·L wrap shows a bright side toward the sun instead of a dark blotch.
 * Returns mild lightScale for the shader (avoid double-killing directional contrast).
 */
export function applyCloudWorldLightScale(
  colors: CloudColorSample,
  elevationDeg: number,
  settings: CloudSettings = getLiveCloudSettings(),
): number {
  const lighting = getActiveLightingSample(elevationDeg);
  const stops = VISUAL.sky.lighting;
  const sunNorm = MathUtils.clamp(
    lighting.sunIntensity / Math.max(stops.noon.sunIntensity, 1e-5),
    0,
    1,
  );
  const ambSpan = Math.max(stops.noon.ambientIntensity - stops.night.ambientIntensity, 1e-5);
  const ambNorm = MathUtils.clamp(
    (lighting.ambientIntensity - stops.night.ambientIntensity) / ambSpan,
    0,
    1,
  );
  const floor = settings.lightScaleMin;
  const gh = todWeights(elevationDeg).goldenHour;
  const aboveHorizon = MathUtils.smoothstep(elevationDeg, -3, 8);
  const catchAmt = MathUtils.clamp(settings.sunCatchStrength, 0, 1);

  // Shadowed side — stay dim with world ambient so clouds aren't emissive slabs.
  const ambScale = Math.max(
    floor,
    MathUtils.lerp(floor, 1, Math.max(ambNorm, lighting.daylightFactor * 0.85)),
  );
  colors.ambientColor.multiplyScalar(ambScale);

  // Lit face — clouds catch more sun than the ground at golden hour / low elevation.
  const catchTarget = MathUtils.clamp(0.5 + gh * 0.5 + aboveHorizon * 0.25, 0, 1);
  const sunScale = Math.max(
    floor,
    MathUtils.lerp(sunNorm, Math.max(sunNorm, catchTarget), aboveHorizon * catchAmt),
  );
  colors.sunColor.multiplyScalar(sunScale);

  // Albedo stays warm enough for the lit wrap to read; don't crush with sunNorm.
  const tintScale = Math.max(
    floor * 2.5,
    MathUtils.lerp(0.7, 1, Math.max(sunScale, aboveHorizon * 0.55)),
  );
  colors.cloudTint.multiplyScalar(tintScale);

  // Mild overall — directional contrast lives in sun≫ambient, not this multiply.
  return Math.max(0.5, MathUtils.lerp(0.55, 1, Math.max(sunNorm, aboveHorizon * 0.65)));
}

/** Colors + opacity + lightScale from elevation and visibility signals. */
export function sampleCloudLit(
  params: CloudVisibilityParams,
  settings: CloudSettings = getLiveCloudSettings(),
): CloudLitSample {
  const lighting = getActiveLightingSample(params.elevationDeg);
  const colors = sampleCloudColors(
    params.elevationDeg,
    {
      sunColor: _sun,
      ambientColor: _ambient,
      cloudTint: _tint,
    },
    settings,
  );
  const lightScale = applyCloudWorldLightScale(colors, params.elevationDeg, settings);
  return {
    colors,
    opacity: computeCloudOpacity(
      {
        ...params,
        atmosphereBlendT: lighting.atmosphereBlendT,
        daylightFactor: lighting.daylightFactor,
      },
      settings,
    ),
    lightScale,
  };
}
