// src/rendering/tod/todBlend.ts — shared night / golden / noon weights from sun elevation
import { Color, MathUtils } from 'three';
import type { TodStopId } from '../../config/visual/tod';
import { VISUAL } from '../../config/visualTuning';

export type TodBand = {
  nightFullDeg: number;
  horizonDeg: number;
  noonStartDeg: number;
  power: number;
};

export type TodWeights = {
  night: number;
  goldenHour: number;
  noon: number;
};

type BandOverride = Partial<TodBand>;

let _bandOverride: BandOverride = {};
let _cachedBand: TodBand | null = null;

const _weightsOut: TodWeights = { night: 0, goldenHour: 0, noon: 0 };
const _colorA = new Color();
const _colorB = new Color();
const _colorC = new Color();

/** DEV: live-tune night / horizon / noon ° and blend power. */
export function setTodBandDevOverride(partial: BandOverride): void {
  _bandOverride = { ..._bandOverride, ...partial };
  _cachedBand = null;
}

export function resetTodBandDevOverride(): void {
  _bandOverride = {};
  _cachedBand = null;
}

export function getTodBand(): TodBand {
  if (_cachedBand) return _cachedBand;
  _cachedBand = { ...VISUAL.tod.goldenHour, ..._bandOverride };
  return _cachedBand;
}

/** 0 at `from`, 1 at `to`. `power` > 1 holds the start of the segment longer. */
function segmentBlend(elevationDeg: number, from: number, to: number, power: number): number {
  const span = to - from;
  if (span < 1e-5) return elevationDeg >= to ? 1 : 0;
  const t = MathUtils.smoothstep(elevationDeg, from, to);
  return MathUtils.clamp(t ** power, 0, 1);
}

/**
 * Night / golden / noon blend weights from sun elevation.
 * Twilight is night→golden up to the horizon; golden→noon runs above it.
 */
export function todWeights(elevationDeg: number, out: TodWeights = _weightsOut): TodWeights {
  const { nightFullDeg, horizonDeg, noonStartDeg, power } = getTodBand();

  if (elevationDeg <= nightFullDeg) {
    out.night = 1;
    out.goldenHour = 0;
    out.noon = 0;
    return out;
  }
  if (elevationDeg < horizonDeg) {
    const u = segmentBlend(elevationDeg, nightFullDeg, horizonDeg, power);
    out.night = 1 - u;
    out.goldenHour = u;
    out.noon = 0;
    return out;
  }
  if (elevationDeg < noonStartDeg) {
    const u = segmentBlend(elevationDeg, horizonDeg, noonStartDeg, power);
    out.night = 0;
    out.goldenHour = 1 - u;
    out.noon = u;
    return out;
  }

  out.night = 0;
  out.goldenHour = 0;
  out.noon = 1;
  return out;
}

/** 0..1 golden amount, `todWeights(...).goldenHour`. */
export function todGoldenAmount(elevationDeg: number): number {
  return todWeights(elevationDeg).goldenHour;
}

/** Preview scrub elevation for a stop (`peakElevationDeg` from active day cycle when provided). */
export function representativeElevation(stop: TodStopId, peakElevationDeg?: number): number {
  const band = getTodBand();
  const peak = peakElevationDeg ?? VISUAL.sky.cycle.peakElevationDeg;
  const floor = VISUAL.sky.cycle.sunriseElevationDeg;
  switch (stop) {
    case 'night':
      return Math.min(band.nightFullDeg, floor);
    case 'goldenHour':
      return band.horizonDeg;
    case 'noon':
      return Math.max(band.noonStartDeg, peak);
  }
}

export function sampleTodScalar(stops: Record<TodStopId, number>, elevationDeg: number): number {
  const w = todWeights(elevationDeg);
  return stops.night * w.night + stops.goldenHour * w.goldenHour + stops.noon * w.noon;
}

export function sampleTodColor(
  stops: Record<TodStopId, string | number | Color>,
  elevationDeg: number,
  out = new Color(),
): Color {
  const w = todWeights(elevationDeg);
  _colorA.set(stops.night);
  _colorB.set(stops.goldenHour);
  _colorC.set(stops.noon);
  out.r = _colorA.r * w.night + _colorB.r * w.goldenHour + _colorC.r * w.noon;
  out.g = _colorA.g * w.night + _colorB.g * w.goldenHour + _colorC.g * w.noon;
  out.b = _colorA.b * w.night + _colorB.b * w.goldenHour + _colorC.b * w.noon;
  return out;
}

export function sampleTodStop<T extends Record<string, number>>(
  stops: Record<TodStopId, T>,
  elevationDeg: number,
  out: T,
): T {
  const w = todWeights(elevationDeg);
  const keys = Object.keys(stops.night) as (keyof T)[];
  for (const key of keys) {
    const n = stops.night[key] as number;
    const g = stops.goldenHour[key] as number;
    const d = stops.noon[key] as number;
    out[key] = (n * w.night + g * w.goldenHour + d * w.noon) as T[keyof T];
  }
  return out;
}

export function dominantTodStop(elevationDeg: number): TodStopId {
  const w = todWeights(elevationDeg);
  // Prefer golden on ties so the band midpoint maps to the goldenHour editor.
  if (w.goldenHour >= w.night && w.goldenHour >= w.noon) return 'goldenHour';
  if (w.noon >= w.night) return 'noon';
  return 'night';
}
