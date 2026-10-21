// src/config/weather.ts — storm fronts: how often they come, how big they are, how fast they cross
//
// Weather is a function of the game clock (`elapsed`, which a save keeps) and a place, so a loaded game
// continues the same sky and the village and the camera can each ask what the weather is where they are.
// A front is a disc of rain that crosses the map with the wind; rain falls inside it and fades over `EDGE_M`
// at its rim.

import { GAME_DAY_S } from './clock.ts';

export const WEATHER = {
  /** Game day length in seconds (`config/clock.ts`). */
  DAY_S: GAME_DAY_S,
  /** A front crosses the village on about this share of days (checked per day, from a hash). */
  CHANCE_PER_DAY: 1 / 3,
  /** The first days are calm, so a new game starts dry. */
  CALM_DAYS: 1,
  /** How fast a front moves (m/s). Slower than the cloud wind: storms are steered by their own. */
  SPEED_MPS: 2.5,
  /** Radius of a front (m), rolled per front. */
  RADIUS_M: { MIN: 600, MAX: 950 },
  /** Width of the soft rim (m), a ramp of about 90 s at `SPEED_MPS`. */
  EDGE_M: 225,
  /** The path of the centre misses the anchor (the village) by up to this share of the radius. */
  LATERAL_MAX: 0.6,
  /** The front's heading differs from the wind by up to this many degrees. */
  HEADING_JITTER_DEG: 30,
  /** Rain at the heart of a front, rolled per front (0..1). */
  PEAK: { MIN: 0.75, MAX: 1 },
  /** The centre passes the anchor at this share of the day. */
  CROSS: { MIN: 0.15, MAX: 0.85 },
  /** Wet ground: seconds to soak at full rain and to dry out again. */
  WET: { RISE_S: 90, DRY_S: 900 },
  /**
   * How a front looks. The sky closes in before the rain: overcast reaches `OVERCAST_LEAD_M` beyond the
   * rim and is full where the rain is.
   */
  LOOK: {
    OVERCAST_LEAD_M: 500,
    /** Sun and ambient light lost under full overcast, and the day factor the sky and the glows follow. */
    SUN_DIM: 0.55,
    AMBIENT_DIM: 0.2,
    DAYLIGHT_DIM: 0.2,
    /** The clouds go grey and thick: light lost on their lit side, shadow side and albedo, and opacity gained. */
    CLOUD_SUN_DIM: 0.55,
    CLOUD_AMBIENT_DIM: 0.35,
    CLOUD_TINT_DIM: 0.45,
    CLOUD_OPACITY_GAIN: 0.35,
    /** Wet ground: albedo lost and colour gained at full wetness (terrain, props, grass). */
    WET_DARKEN: 0.22,
    WET_SATURATE: 0.2,
    /** Rain streaks: a box that follows the camera, with this many streaks at full rain. */
    STREAKS: {
      COUNT: 3500,
      BOX_M: 70,
      HEIGHT_M: 45,
      FALL_MPS: 14,
      LENGTH_M: 0.9,
      WIDTH_M: 0.03,
      ALPHA: 0.55,
    },
  },
} as const;
