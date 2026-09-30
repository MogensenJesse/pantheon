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
 * Sun-elevation look clock.
 * `elev ≤ nightFull` → night; twilight to `horizon` → golden;
 * `horizon` → `noonStart` → noon; above that → noon through the cycle peak.
 */
export const tod = {
  goldenHour: {
    /** At/below = full night. Matches the day-cycle sunrise/sunset. */
    nightFullDeg: -5,
    /** Horizon. Golden hour; night and aurora are off. */
    horizonDeg: 0,
    /** At/above = full noon, held through the cycle peak. */
    noonStartDeg: 12,
    /** >1 holds each segment's start stop longer. */
    power: 1,
  },
} as const;
