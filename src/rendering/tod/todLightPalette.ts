// src/rendering/tod/todLightPalette.ts — per-stop key/fill light colors + foliage hemisphere tints
import { Color } from 'three';
import type { TodStopId } from '../../config/visual/tod';
import { TOD_STOPS } from '../../config/visual/tod';
import { VISUAL } from '../../config/visualTuning';
import { sampleTodColor } from './todBlend';

/** One stop of the shared light palette (hex strings). */
export type TodLightPaletteStop = {
  /** Key light (DirectionalLight sun). */
  sun: string;
  /** Fill light (AmbientLight). */
  ambient: string;
  /** Foliage hemisphere up tint (props + grass). */
  foliageSky: string;
  /** Foliage hemisphere down tint (props + grass). */
  foliageGround: string;
};

export type TodLightPaletteSample = {
  sun: Color;
  ambient: Color;
  foliageSky: Color;
  foliageGround: Color;
  /** sun ÷ reference — neutral (white) at the reference color. */
  sunTint: Color;
  /** ambient ÷ reference — neutral (white) at the reference color. */
  ambientTint: Color;
};

function baseStop(stop: TodStopId): TodLightPaletteStop {
  const light = VISUAL.sky.lightColors[stop];
  const foliage = VISUAL.foliage.tintStops[stop];
  return {
    sun: light.sun,
    ambient: light.ambient,
    foliageSky: foliage.sky,
    foliageGround: foliage.ground,
  };
}

const _overrides: Record<TodStopId, Partial<TodLightPaletteStop>> = {
  night: {},
  goldenHour: {},
  noon: {},
};

let _version = 0;

/** Bumps on every DEV override change — receivers re-sync even while elevation is locked. */
export function todLightPaletteVersion(): number {
  return _version;
}

/** DEV: override one stop field (hex). */
export function setTodLightPaletteDevOverride(
  stop: TodStopId,
  partial: Partial<TodLightPaletteStop>,
): void {
  _overrides[stop] = { ..._overrides[stop], ...partial };
  _version++;
}

export function resetTodLightPaletteDevOverride(): void {
  for (const stop of TOD_STOPS) _overrides[stop] = {};
  _version++;
}

export function getActiveTodLightPaletteStop(stop: TodStopId): TodLightPaletteStop {
  return { ...baseStop(stop), ..._overrides[stop] };
}

const _stops = {} as Record<TodStopId, TodLightPaletteStop>;
const _refSun = new Color();
const _refAmbient = new Color();
const _sample: TodLightPaletteSample = {
  sun: new Color(),
  ambient: new Color(),
  foliageSky: new Color(),
  foliageGround: new Color(),
  sunTint: new Color(),
  ambientTint: new Color(),
};

function pick(field: keyof TodLightPaletteStop): Record<TodStopId, string> {
  return {
    night: _stops.night[field],
    goldenHour: _stops.goldenHour[field],
    noon: _stops.noon[field],
  };
}

function divideSafe(a: Color, b: Color, out: Color): Color {
  out.r = b.r > 1e-5 ? a.r / b.r : 1;
  out.g = b.g > 1e-5 ? a.g / b.g : 1;
  out.b = b.b > 1e-5 ? a.b / b.b : 1;
  return out;
}

/**
 * Blend the light palette at this sun elevation.
 * Returns shared scratch — copy if you need to keep it.
 */
export function sampleTodLightPalette(elevationDeg: number): TodLightPaletteSample {
  for (const stop of TOD_STOPS) _stops[stop] = getActiveTodLightPaletteStop(stop);
  sampleTodColor(pick('sun'), elevationDeg, _sample.sun);
  sampleTodColor(pick('ambient'), elevationDeg, _sample.ambient);
  sampleTodColor(pick('foliageSky'), elevationDeg, _sample.foliageSky);
  sampleTodColor(pick('foliageGround'), elevationDeg, _sample.foliageGround);
  const ref = VISUAL.sky.lightColorReference;
  _refSun.set(ref.sun);
  _refAmbient.set(ref.ambient);
  divideSafe(_sample.sun, _refSun, _sample.sunTint);
  divideSafe(_sample.ambient, _refAmbient, _sample.ambientTint);
  return _sample;
}
