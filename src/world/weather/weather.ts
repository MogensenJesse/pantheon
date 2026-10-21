// src/world/weather/weather.ts — storm fronts, a function of the game clock and a place (pure: node-runnable)
//
//   const weather = createWeather({ anchorX, anchorZ, seed, windDirectionDeg });
//   weather.rainAt(x, z, clockS)   // 0..1 where you stand
//
// Each game day has a roll (a hash of the day and the map's seed): about one day in three brings a front, a
// disc of rain that crosses the map with the wind and passes within `LATERAL_MAX` of its radius from the
// anchor, so the village is always hit when a front comes while a camera far to the side may stay dry. Nothing
// is stored: the same clock gives the same sky, which is why a save only has to keep the clock. Fronts called
// up by powers (`addFront`) and holes cut in the weather (`clearSkies`) are the one thing that is not derived.

import { WEATHER } from '../../config/weather.ts';
import { isNum } from '../../core/guards.ts';
import { clamp01, lerp, smoothstepEdges } from '../../core/math/scalar.ts';

const W = WEATHER;

/** A front: a disc of rain moving in a straight line. */
export interface Front {
  /** Where the centre is at `crossS` (m). */
  x: number;
  z: number;
  /** Unit heading. */
  dirX: number;
  dirZ: number;
  speed: number;
  radius: number;
  /** Rain at the heart (0..1). */
  peak: number;
  /** The clock at which the centre is at (x, z). */
  crossS: number;
}

/** A hole in the weather: no rain inside, fading out over `edgeM`, from `fromS` to `untilS`. */
export interface ClearZone {
  x: number;
  z: number;
  radius: number;
  edgeM: number;
  fromS: number;
  untilS: number;
}

export interface WeatherOptions {
  /** The place a front is aimed at: the village, or the middle of the map. */
  anchorX: number;
  anchorZ: number;
  /** Differs per map. */
  seed: number;
  /** Where the cloud wind blows toward (degrees; 270 is toward -x). */
  windDirectionDeg: number;
}

export interface Weather {
  /** Rain 0..1 at a place and a time (the game clock in seconds). */
  rainAt: (x: number, z: number, clockS: number) => number;
  /** How closed in the sky is, 0..1: it starts before the rain arrives and is full where it rains. */
  overcastAt: (x: number, z: number, clockS: number) => number;
  /** Fronts that are anywhere near the map at this time, with the position of their centre. */
  frontsAt: (clockS: number) => (Front & { cx: number; cz: number })[];
  /** The scheduled front of a game day, or null (a calm day). */
  frontOfDay: (day: number) => Front | null;
  /** Hook for the rain powers: a front now, as if the weather had made it. Not saved. */
  addFront: (front: Front) => void;
  /** Hook for the clear-skies power: a hole in the rain. Not saved. */
  clearSkies: (zone: ClearZone) => void;
  /** Forget forced fronts and clear zones. */
  reset: () => void;
  /** What a save keeps: the fronts and holes the powers made that still matter at `clockS` (the rest is dropped). */
  serialize: (clockS: number) => ForcedWeather;
  restore: (state: ForcedWeather) => void;
}

/** The weather the powers made (the rest is derived from the clock). */
export interface ForcedWeather {
  fronts: Front[];
  zones: ClearZone[];
}

/** Why saved forced weather cannot be used, or null. */
export function forcedWeatherProblem(state: unknown): string | null {
  const bad = 'saved game: the called storms and cleared skies are damaged';
  const s = state as Partial<ForcedWeather> | null;
  if (!s || !Array.isArray(s.fronts) || !Array.isArray(s.zones)) return bad;
  for (const f of s.fronts as Partial<Front>[]) {
    if (!f || ![f.x, f.z, f.dirX, f.dirZ, f.speed, f.radius, f.peak, f.crossS].every(isNum))
      return bad;
    if ((f.radius as number) <= 0 || (f.speed as number) < 0 || (f.peak as number) < 0) return bad;
  }
  for (const z of s.zones as Partial<ClearZone>[]) {
    if (!z || ![z.x, z.z, z.radius, z.edgeM, z.fromS, z.untilS].every(isNum)) return bad;
    if ((z.radius as number) <= 0 || (z.edgeM as number) < 0) return bad;
  }
  return null;
}

/** 0..1 hash of (a, b, salt): the same inputs always give the same number. */
export function unitHash(a: number, b: number, salt: number): number {
  let h =
    Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A stable number for a name (a map id), to tell one map's weather from another's. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}

/** Rain a front gives at a place and time: its peak, fading to nothing over `EDGE_M` at the rim. */
export function frontRainAt(front: Front, x: number, z: number, clockS: number): number {
  const along = front.speed * (clockS - front.crossS);
  const cx = front.x + front.dirX * along;
  const cz = front.z + front.dirZ * along;
  const d = Math.hypot(x - cx, z - cz);
  if (d >= front.radius) return 0;
  return front.peak * (1 - smoothstepEdges(front.radius - W.EDGE_M, front.radius, d));
}

/** Overcast a front gives: full where the rain is nearly full, fading out `OVERCAST_LEAD_M` beyond its rim. */
function frontOvercastAt(front: Front, x: number, z: number, clockS: number): number {
  const along = front.speed * (clockS - front.crossS);
  const d = Math.hypot(x - (front.x + front.dirX * along), z - (front.z + front.dirZ * along));
  return 1 - smoothstepEdges(front.radius - W.EDGE_M, front.radius + W.LOOK.OVERCAST_LEAD_M, d);
}

export function createWeather(options: WeatherOptions): Weather {
  const { anchorX, anchorZ, seed, windDirectionDeg } = options;
  const forced: Front[] = [];
  const zones: ClearZone[] = [];
  const cache = new Map<number, Front | null>();

  const frontOfDay = (day: number): Front | null => {
    if (day < W.CALM_DAYS) return null;
    if (cache.has(day)) return cache.get(day)!;
    let front: Front | null = null;
    if (unitHash(day, seed, 1) < W.CHANCE_PER_DAY) {
      const radius = lerp(W.RADIUS_M.MIN, W.RADIUS_M.MAX, unitHash(day, seed, 3));
      const heading =
        ((windDirectionDeg + (unitHash(day, seed, 5) * 2 - 1) * W.HEADING_JITTER_DEG) * Math.PI) /
        180;
      const dirX = Math.sin(heading);
      const dirZ = Math.cos(heading);
      const lateral = (unitHash(day, seed, 4) * 2 - 1) * W.LATERAL_MAX * radius;
      front = {
        // the centre passes the anchor's line of travel `lateral` to the side of it
        x: anchorX - dirZ * lateral,
        z: anchorZ + dirX * lateral,
        dirX,
        dirZ,
        speed: W.SPEED_MPS,
        radius,
        peak: lerp(W.PEAK.MIN, W.PEAK.MAX, unitHash(day, seed, 6)),
        crossS: (day + lerp(W.CROSS.MIN, W.CROSS.MAX, unitHash(day, seed, 2))) * W.DAY_S,
      };
    }
    cache.set(day, front);
    return front;
  };

  /** Scheduled fronts that can reach the map around this time: yesterday's tail, today's, tomorrow's lead. */
  const scheduled = (clockS: number): Front[] => {
    const day = Math.floor(clockS / W.DAY_S);
    const out: Front[] = [];
    for (let d = day - 1; d <= day + 1; d++) {
      const f = frontOfDay(d);
      if (f) out.push(f);
    }
    return out;
  };

  /** Holes in the weather close the sky as well as the rain. */
  const cleared = (value: number, x: number, z: number, clockS: number): number => {
    let out = value;
    for (const zone of zones) {
      if (clockS < zone.fromS || clockS >= zone.untilS) continue;
      const d = Math.hypot(x - zone.x, z - zone.z);
      out *= smoothstepEdges(zone.radius - zone.edgeM, zone.radius, d);
    }
    return clamp01(out);
  };

  const rainAt = (x: number, z: number, clockS: number): number => {
    let rain = 0;
    for (const f of scheduled(clockS)) rain = Math.max(rain, frontRainAt(f, x, z, clockS));
    for (const f of forced) rain = Math.max(rain, frontRainAt(f, x, z, clockS));
    return rain <= 0 ? 0 : cleared(rain, x, z, clockS);
  };

  const overcastAt = (x: number, z: number, clockS: number): number => {
    let sky = 0;
    for (const f of scheduled(clockS)) sky = Math.max(sky, frontOvercastAt(f, x, z, clockS));
    for (const f of forced) sky = Math.max(sky, frontOvercastAt(f, x, z, clockS));
    return sky <= 0 ? 0 : cleared(sky, x, z, clockS);
  };

  return {
    rainAt,
    overcastAt,
    frontOfDay,
    frontsAt: (clockS) =>
      [...scheduled(clockS), ...forced].map((f) => {
        const along = f.speed * (clockS - f.crossS);
        return { ...f, cx: f.x + f.dirX * along, cz: f.z + f.dirZ * along };
      }),
    addFront: (front) => {
      forced.push(front);
    },
    clearSkies: (zone) => {
      zones.push(zone);
    },
    reset: () => {
      forced.length = 0;
      zones.length = 0;
    },
    serialize: (clockS) => {
      // A called front is over once it has crossed the map's 3 km and a rim; a hole once its time is up.
      const over = (f: Front) =>
        clockS > f.crossS + (f.radius * 2 + W.EDGE_M * 2 + 3000) / Math.max(f.speed, 0.01);
      return {
        fronts: forced.filter((f) => !over(f)).map((f) => ({ ...f })),
        zones: zones.filter((z) => z.untilS > clockS).map((z) => ({ ...z })),
      };
    },
    restore: (state) => {
      forced.length = 0;
      zones.length = 0;
      for (const f of state.fronts) forced.push({ ...f });
      for (const z of state.zones) zones.push({ ...z });
    },
  };
}

/**
 * Wet ground follows the rain at one place: it soaks over `RISE_S` while rain falls and dries over `DRY_S`
 * after. Returns the new wetness (0..1).
 */
export function stepWetness(wet: number, rain: number, dt: number): number {
  if (rain > wet) return Math.min(rain, wet + dt / W.WET.RISE_S);
  return Math.max(rain, wet - dt / W.WET.DRY_S);
}
