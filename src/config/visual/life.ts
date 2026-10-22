// src/config/visual/life.ts — the world's ambient life: wind strength beyond the calm base, and (later) what drifts and lives in it
//
// Plain numbers, node-safe: `src/life/*` modules that checks run import it with the `.ts` extension.

export const life = {
  WIND: {
    /** Extra wind at full rain, as a multiplier added to 1 (a storm blows this much harder than calm). */
    STORM_GAIN: 0.9,
    /** Extra wind while rain is about to arrive (the gust before a front), added to 1 at full effect. */
    PRE_RAIN_GAIN: 0.6,
    /** How far ahead (game seconds) the gust before rain looks: the rain that is `LEAD_S` away blows it. */
    PRE_RAIN_LEAD_S: 75,
    /** Time constant (s) the wind boost takes to follow its target, so a front does not jerk the trees. */
    SMOOTH_S: 6,
  },
  /** Chimney smoke follows the wind: the drift speed at calm (m of drift per unit wind) and how slowly the plume turns. */
  SMOKE: {
    /** Strength of the smoke's wind at calm: the old fixed drift vector's length, so the calm look is unchanged. */
    WIND_MUL: 0.873,
    /** Time constant (s) the plume takes to turn with a change of wind (a puff's place is a pure function of its age). */
    WIND_SMOOTH_S: 4,
  },
  /** Wheat rolls in waves along the wind and lies down in rain (blades in a wheat field only). */
  WHEAT: {
    /** How strongly the wave modulates the wind's lean (0 = none); the wave itself runs -0.5..0.5. */
    WAVE_GAIN: 1.1,
    /** A breeze that rolls through the wheat even in a lull, in wind units (the grass's wind is about 0.27). */
    WAVE_BASE: 0.07,
    WAVE_LENGTH_M: 12,
    WAVE_PERIOD_S: 3.2,
    /** Extra downwind lean at full wetness (a rain-soaked field lies down), in wind units. */
    LODGE_LEAN: 0.35,
  },
  /** Plants react to the orb whatever the phase: grass rustles around it, flowers brighten and sway. */
  ORB_PLANTS: {
    RUSTLE_RADIUS_M: 5,
    /** Lean (m, like the wind's bend) of a full-height blade at the orb, and the rustle's rate (rad/s). */
    RUSTLE_STRENGTH: 0.25,
    RUSTLE_RATE: 7,
    FLOWER_RADIUS_M: 6,
    /** Extra brightness of a flower at the orb (1 = twice as bright) and extra sway (same unit). */
    FLOWER_GLOW_GAIN: 0.8,
    FLOWER_SWAY_GAIN: 2,
  },
  /**
   * Things that drift in the wind, in a box that follows the camera. `DRIFT` is the look of one kind; `RULES` say
   * how much of it there is (a share of its count, 0..1) from the place, the weather and the time of day.
   */
  LEAVES: {
    // Look
    count: 160,
    boxM: 60,
    heightM: 12,
    shape: 'leaf',
    additive: false,
    sizeM: [0.1, 0.2],
    colorA: '#5d7f34',
    colorB: '#8aa64a',
    /** Birch leaves (the share of the leaves that is birch near the camera) are copper. */
    altColor: '#b8702c',
    hdr: 1,
    alpha: 0.95,
    windSpeedMul: 3.2,
    fallMps: 0.55,
    wobbleM: 0.5,
    wobbleHz: 0.35,
    spin: 4,
    blinkHz: 0,
    nightMul: 0.12,
    // Rules
    /** The share of the leaves that shows in calm weather; it rises to 1 as the wind boost reaches `FULL_BOOST`. */
    CALM_SHARE: 0.3,
    FULL_BOOST: 1.8,
    /** Rain keeps this share of the leaves and the night this share. */
    RAIN_KEEP: 0.5,
    NIGHT_KEEP: 0.4,
  },
  POLLEN: {
    count: 220,
    boxM: 50,
    heightM: 8,
    shape: 'dot',
    additive: true,
    sizeM: [0.03, 0.06],
    colorA: '#f5e9a8',
    colorB: '#ffffff',
    altColor: '#ffffff',
    /** Additive fields multiply their colour by this and by the bloom scale (12), so a tiny speck stays soft. */
    hdr: 0.05,
    alpha: 0.5,
    windSpeedMul: 1.4,
    fallMps: 0.05,
    wobbleM: 0.8,
    wobbleHz: 0.25,
    spin: 0,
    blinkHz: 0,
    nightMul: 1,
    /** Pollen needs a still, dry day: it thins as the wind rises past `GONE_BOOST` and goes in rain. */
    GONE_BOOST: 1.6,
    /** How much of it hangs in the woods compared with open ground (share kept under trees). */
    WOODS_KEEP: 0.4,
  },
  /** How trees are counted into the habitat grid that leaves and fireflies read: cell size (m) and trees for a full cell. */
  HABITAT: {
    CELL_M: 32,
    FULL_TREES_PER_CELL: 10,
    /** Seconds the camera's local habitat takes to follow (so crossing a glade does not flicker the count). */
    FOLLOW_S: 2.5,
  },
} as const;
