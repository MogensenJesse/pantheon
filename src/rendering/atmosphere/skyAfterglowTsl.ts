// src/rendering/atmosphere/skyAfterglowTsl.ts — twilight afterglow band on sky backgrounds
import { Color, MathUtils, Vector2 } from 'three';
import {
  dot,
  float,
  max,
  mix,
  normalize,
  positionWorldDirection,
  pow,
  smoothstep,
  uniform,
  vec2,
} from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

type TslNode = any;

type AfterglowTune = {
  enabled: boolean;
  startDeg: number;
  peakDeg: number;
  endDeg: number;
  strength: number;
  bandHeight: number;
  sunSidePower: number;
  sunSideColor: string;
  antiSunColor: string;
  antiSunStrength: number;
};

let _tune: AfterglowTune = { ...VISUAL.sky.afterglow };

/** Shared by every sky background — one CPU sync drives Preetham, aurora and HDRI. */
const afterglowUniforms = {
  uStrength: uniform(0),
  uBandHeight: uniform(_tune.bandHeight),
  uSunSidePower: uniform(_tune.sunSidePower),
  uSunSideColor: uniform(new Color(_tune.sunSideColor)),
  uAntiSunColor: uniform(new Color(_tune.antiSunColor)),
  uAntiSunStrength: uniform(_tune.antiSunStrength),
  uSunDirXZ: uniform(new Vector2(1, 0)),
};

/** Additive afterglow on already-exposed sky RGB (callers: applySkyHorizonHaze). */
export function addSkyAfterglow(rgb: TslNode): TslNode {
  const u = afterglowUniforms;
  const dir = positionWorldDirection;
  const band = float(1).sub(smoothstep(float(0), u.uBandHeight, max(dir.y, float(0))));
  const horiz = normalize(vec2(dir.x, dir.z).add(vec2(1e-5, 0)));
  const facing = dot(horiz, u.uSunDirXZ).mul(0.5).add(0.5);
  const sunSide = pow(facing, u.uSunSidePower);
  const color = mix(u.uAntiSunColor.mul(u.uAntiSunStrength), u.uSunSideColor, sunSide);
  return rgb.add(color.mul(band).mul(u.uStrength));
}

/** 0 outside twilight; rises from startDeg to peakDeg, falls to 0 at endDeg. */
export function afterglowWeightForElevation(elevationDeg: number): number {
  const { startDeg, peakDeg, endDeg } = _tune;
  // Expects endDeg < peakDeg < startDeg (sun sinking from start → peak → end).
  const rise = 1 - MathUtils.smoothstep(elevationDeg, peakDeg, startDeg);
  const fall = MathUtils.smoothstep(elevationDeg, endDeg, peakDeg);
  return Math.min(rise, fall);
}

/** Per-frame: sun elevation drives strength, sun azimuth drives the warm lobe. */
export function syncSkyAfterglow(elevationDeg: number, sunDir: { x: number; z: number }): void {
  const u = afterglowUniforms;
  u.uStrength.value = _tune.enabled
    ? _tune.strength * afterglowWeightForElevation(elevationDeg)
    : 0;
  const len = Math.hypot(sunDir.x, sunDir.z);
  if (len > 1e-5) u.uSunDirXZ.value.set(sunDir.x / len, sunDir.z / len);
}

export function getSkyAfterglowTune(): AfterglowTune {
  return _tune;
}

/** DEV: live-tune afterglow fields. */
export function setSkyAfterglowDevOverride(partial: Partial<AfterglowTune>): void {
  _tune = { ..._tune, ...partial };
  applyStaticUniforms();
}

export function resetSkyAfterglowDevOverride(): void {
  _tune = { ...VISUAL.sky.afterglow };
  applyStaticUniforms();
}

function applyStaticUniforms(): void {
  const u = afterglowUniforms;
  u.uBandHeight.value = _tune.bandHeight;
  u.uSunSidePower.value = _tune.sunSidePower;
  u.uSunSideColor.value.set(_tune.sunSideColor);
  u.uAntiSunColor.value.set(_tune.antiSunColor);
  u.uAntiSunStrength.value = _tune.antiSunStrength;
}
