// src/rendering/clouds/cloudColorTsl.ts — elevation-driven cloud sun/ambient/tint + visibility
import { Color, MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { goldenHourT } from '../postfx/postfxCohesion';
import { getActiveLightingSample } from '../sky/lightingCurves';
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
const _a = new Color();
const _b = new Color();
const _mid = new Color();

const PALETTE = {
  // Moonlit cool gray — dimmer than day, still readable on the night HDRI.
  night: { sun: 0x4a5a7a, ambient: 0x1c2438, tint: 0x8a96b0 },
  // Warm dawn/dusk — desaturated vs neon ember so intensity scale stays believable.
  golden: { sun: 0xd4884a, ambient: 0x4a3828, tint: 0xe0a070 },
  lowSun: { sun: 0xffcc88, ambient: 0x667799, tint: 0xffeedd },
  midday: { sun: 0xfff8e7, ambient: 0xb0c4de, tint: 0xffffff },
} as const;

function lerpPalette(
  from: (typeof PALETTE)[keyof typeof PALETTE],
  to: (typeof PALETTE)[keyof typeof PALETTE],
  t: number,
  out: CloudColorSample,
): CloudColorSample {
  const tt = MathUtils.clamp(t, 0, 1);
  out.sunColor.copy(_a.setHex(from.sun)).lerp(_b.setHex(to.sun), tt);
  out.ambientColor.copy(_a.setHex(from.ambient)).lerp(_b.setHex(to.ambient), tt);
  out.cloudTint.copy(_a.setHex(from.tint)).lerp(_b.setHex(to.tint), tt);
  return out;
}

/**
 * Sun elevation (°) → cloud lighting colors.
 * Golden warm tint is gated by goldenHourT × goldenTintStrength so raw elevation
 * alone cannot paint full neon orange while the world sun is still near zero.
 */
export function sampleCloudColors(
  elevationDeg: number,
  out: CloudColorSample = { sunColor: _sun, ambientColor: _ambient, cloudTint: _tint },
  settings: CloudSettings = getLiveCloudSettings(),
): CloudColorSample {
  const goldenAmt = goldenHourT(elevationDeg) * settings.goldenTintStrength;

  if (elevationDeg < -2) {
    return lerpPalette(PALETTE.night, PALETTE.night, 0, out);
  }
  if (elevationDeg < 1) {
    // Night → golden, but only as far as goldenAmt allows (pulls back toward night when dim).
    const toGolden =
      MathUtils.smoothstep(elevationDeg, -2, 1) * MathUtils.clamp(goldenAmt + 0.15, 0, 1);
    return lerpPalette(PALETTE.night, PALETTE.golden, toGolden, out);
  }
  if (elevationDeg < 6) {
    // Golden → lowSun; reduce golden peak by (1 - goldenAmt) toward lowSun early.
    const band = MathUtils.smoothstep(elevationDeg, 1, 6);
    const fromGolden = MathUtils.clamp(goldenAmt, 0, 1);
    lerpPalette(PALETTE.golden, PALETTE.lowSun, band, out);
    // When goldenAmt is low, bias further toward lowSun/night-cool.
    out.sunColor.lerp(_mid.setHex(PALETTE.lowSun.sun), 1 - fromGolden);
    out.ambientColor.lerp(_mid.setHex(PALETTE.lowSun.ambient), 1 - fromGolden);
    out.cloudTint.lerp(_mid.setHex(PALETTE.lowSun.tint), 1 - fromGolden);
    return out;
  }
  if (elevationDeg < 20) {
    return lerpPalette(
      PALETTE.lowSun,
      PALETTE.midday,
      MathUtils.smoothstep(elevationDeg, 6, 20),
      out,
    );
  }
  return lerpPalette(PALETTE.midday, PALETTE.midday, 0, out);
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
  const curve = VISUAL.sky.lightingCurve;
  const sunNorm = MathUtils.clamp(
    lighting.sunIntensity / Math.max(curve.sunIntensityMax, 1e-5),
    0,
    1,
  );
  const ambSpan = Math.max(curve.ambientMax - curve.ambientMin, 1e-5);
  const ambNorm = MathUtils.clamp((lighting.ambientIntensity - curve.ambientMin) / ambSpan, 0, 1);
  const floor = settings.lightScaleMin;
  const gh = goldenHourT(elevationDeg);
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
