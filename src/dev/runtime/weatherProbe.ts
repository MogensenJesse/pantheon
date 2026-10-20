// src/dev/runtime/weatherProbe.ts — DEV console hook: window.__pantheonWeather

import { WEATHER } from '../../config/weather';
import { weatherLook } from '../../rendering/weather/weatherLook';
import type { Weather } from '../../world/weather/weather';
import { installDevHook } from './devHook';

export interface WeatherProbeSources {
  weather: Weather;
  /** The game clock (s) the weather runs on. */
  clock: () => number;
  /** Where the player stands. */
  position: () => { x: number; z: number };
  /** Force the rain the village feels (null follows the weather). */
  forceVillageRain: (rain01: number | null) => void;
}

/**
 * Install `window.__pantheonWeather`: read the rain anywhere, list the coming fronts, call a storm or part
 * the clouds, and force the village's rain. Returns a disposer.
 */
export function initWeatherProbe(src: WeatherProbeSources): () => void {
  const { weather } = src;
  const round = (v: number) => Math.round(v * 100) / 100;
  return installDevHook('__pantheonWeather', {
    /** Rain 0..1 where the player stands, or at (x, z). */
    rain: (x?: number, z?: number) => {
      const p = src.position();
      return round(weather.rainAt(x ?? p.x, z ?? p.z, src.clock()));
    },
    clock: () => round(src.clock()),
    /** What the camera sees: rain, how closed in the sky is, and wet ground. */
    look: () => ({
      rain: round(weatherLook.rain01),
      overcast: round(weatherLook.overcast01),
      wetness: round(weatherLook.wetness01),
    }),
    /** Fronts that exist now (scheduled or called), with their centres. */
    fronts: () =>
      weather.frontsAt(src.clock()).map((f) => ({
        centre: [Math.round(f.cx), Math.round(f.cz)],
        radius: Math.round(f.radius),
        peak: round(f.peak),
        crossesAt: Math.round(f.crossS),
      })),
    /** The next `days` game days: which bring a front, and when its centre passes the village. */
    schedule: (days = 10) => {
      const day0 = Math.floor(src.clock() / WEATHER.DAY_S);
      return Array.from({ length: days }, (_, i) => {
        const f = weather.frontOfDay(day0 + i);
        return {
          day: day0 + i,
          front: f
            ? {
                crossesAtS: Math.round(f.crossS),
                radius: Math.round(f.radius),
                peak: round(f.peak),
              }
            : null,
        };
      });
    },
    /** Call a storm: a front centred on the player (or at x, z) that stays for a while. */
    callStorm: (radius = 800, x?: number, z?: number, peak = 1) => {
      const p = src.position();
      weather.addFront({
        x: x ?? p.x,
        z: z ?? p.z,
        dirX: -1,
        dirZ: 0,
        speed: WEATHER.SPEED_MPS,
        radius,
        peak,
        crossS: src.clock(),
      });
    },
    /** Part the clouds around the player (or x, z) for `seconds`. */
    clearSkies: (seconds = 600, radius = 1200, x?: number, z?: number) => {
      const p = src.position();
      const now = src.clock();
      weather.clearSkies({
        x: x ?? p.x,
        z: z ?? p.z,
        radius,
        edgeM: WEATHER.EDGE_M,
        fromS: now,
        untilS: now + seconds,
      });
    },
    /** Forget called storms and cleared skies. */
    reset: () => weather.reset(),
    /** Force the rain the village feels (0..1), or null to follow the weather. */
    forceVillageRain: (rain01: number | null) => src.forceVillageRain(rain01),
  });
}
