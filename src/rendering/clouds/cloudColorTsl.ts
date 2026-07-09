// src/rendering/clouds/cloudColorTsl.ts — elevation-driven cloud sun/ambient/tint + visibility
import { Color, MathUtils } from 'three';
import { getActiveLightingSample } from '../sky/lightingCurves';
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

const _sun = new Color();
const _ambient = new Color();
const _tint = new Color();
const _a = new Color();
const _b = new Color();

const PALETTE = {
  night: { sun: 0x112244, ambient: 0x0a0a1a, tint: 0x1a1a2e },
  golden: { sun: 0xff6622, ambient: 0x553322, tint: 0xff8844 },
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

/** Sun elevation (°) → cloud lighting colors (skill cloudColorForTimeOfDay bands). */
export function sampleCloudColors(
  elevationDeg: number,
  out: CloudColorSample = { sunColor: _sun, ambientColor: _ambient, cloudTint: _tint },
): CloudColorSample {
  if (elevationDeg < -2) {
    return lerpPalette(PALETTE.night, PALETTE.night, 0, out);
  }
  if (elevationDeg < 1) {
    return lerpPalette(PALETTE.night, PALETTE.golden, MathUtils.smoothstep(elevationDeg, -2, 1), out);
  }
  if (elevationDeg < 6) {
    return lerpPalette(PALETTE.golden, PALETTE.lowSun, MathUtils.smoothstep(elevationDeg, 1, 6), out);
  }
  if (elevationDeg < 20) {
    return lerpPalette(PALETTE.lowSun, PALETTE.midday, MathUtils.smoothstep(elevationDeg, 6, 20), out);
  }
  return lerpPalette(PALETTE.midday, PALETTE.midday, 0, out);
}

/**
 * Master opacity multiplier — reveal ramp × daylight × HDRI fade.
 * Uses atmosphereBlendT from the same lighting sample as sky/post sync.
 */
export function computeCloudOpacityMultiplier(params: CloudVisibilityParams): number {
  const settings = getLiveCloudSettings();
  const revealMul = MathUtils.lerp(
    settings.revealMinCoverage,
    settings.revealMaxCoverage,
    MathUtils.clamp(params.atmosphereBlendT, 0, 1),
  );
  const hdriFade = 1 - MathUtils.clamp(params.hdriWeight, 0, 1);
  const daylight = MathUtils.clamp(params.daylightFactor, 0, 1);
  return revealMul * hdriFade * daylight;
}

export function computeCloudOpacity(
  params: CloudVisibilityParams,
  settings = getLiveCloudSettings(),
): number {
  const mul = computeCloudOpacityMultiplier(params);
  return settings.opacity * MathUtils.clamp(mul, 0, 1);
}

/** Convenience — colors + opacity from elevation and visibility signals. */
export function sampleCloudLighting(params: CloudVisibilityParams): {
  colors: CloudColorSample;
  opacity: number;
  atmosphereBlendT: number;
} {
  const lighting = getActiveLightingSample(params.elevationDeg);
  return {
    colors: sampleCloudColors(params.elevationDeg),
    opacity: computeCloudOpacity({
      ...params,
      atmosphereBlendT: lighting.atmosphereBlendT,
      daylightFactor: lighting.daylightFactor,
    }),
    atmosphereBlendT: lighting.atmosphereBlendT,
  };
}
