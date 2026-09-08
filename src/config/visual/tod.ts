// src/config/visual/tod.ts — shared time-of-day stop IDs + golden-hour elevation band

/** Canonical look stops shared by Preetham, grade, terrain, fog, etc. */
export type TodStopId = 'night' | 'goldenHour' | 'noon';

export const TOD_STOPS = ['night', 'goldenHour', 'noon'] as const satisfies readonly TodStopId[];

export const TOD_STOP_LABELS: Record<TodStopId, string> = {
  night: 'Night',
  goldenHour: 'Golden hour',
  noon: 'Noon',
};

/**
 * Golden-hour sun-elevation band — single look clock.
 * `elev ≤ start` → night; inside band → night↔golden↔noon; `elev ≥ end` → noon.
 */
export const tod = {
  goldenHour: {
    /** Below = full night look. */
    startElevationDeg: -4,
    /** Above = full noon look. */
    endElevationDeg: 35,
    /** >1 sharpens the golden peak inside the band. */
    power: 1,
  },
} as const;
