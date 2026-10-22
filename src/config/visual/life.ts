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
    orbPullM: 0,
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
    orbPullM: 0,
    /** Pollen needs a still, dry day: it thins as the wind rises past `GONE_BOOST` and goes in rain. */
    GONE_BOOST: 1.6,
    /** How much of it hangs in the woods compared with open ground (share kept under trees). */
    WOODS_KEEP: 0.4,
  },
  /** Fireflies hover and wander near the ground and blink; they gather round the orb once the world is alive (Phase 1+). */
  FIREFLIES: {
    count: 140,
    boxM: 36,
    heightM: 3.2,
    shape: 'dot',
    additive: true,
    sizeM: [0.05, 0.09],
    colorA: '#d8ff7a',
    colorB: '#ffe58a',
    altColor: '#d8ff7a',
    /** Multiplied by the bloom scale (12): a speck glows without filling the screen. */
    hdr: 0.35,
    alpha: 1,
    windSpeedMul: 0.15,
    fallMps: 0,
    wobbleM: 1.6,
    wobbleHz: 0.12,
    spin: 0,
    blinkHz: 0.35,
    nightMul: 1,
    /** Fireflies within this distance of the orb drift toward it (creatures notice the orb from Phase 1). */
    orbPullM: 12,
    // Rules
    /** The share of the fireflies at night in open ground away from trees and water; wooded or shore ground raises it to 1. */
    OPEN_SHARE: 0.15,
    /** A shore is within this many metres of the water level in height. */
    SHORE_BAND_M: [1.5, 4],
    /** A gale keeps them in: they thin out toward this share at `GALE_BOOST`, and rain keeps this share. */
    GALE_BOOST: 2.2,
    GALE_KEEP: 0.2,
    RAIN_KEEP: 0.25,
  },
  /** How creatures (fireflies now, animals later) notice the orb, once the world is alive. */
  ORB_NOTICE: {
    /** Specks inside this share of the pull radius gather as tightly as they will. */
    INNER_SHARE: 0.35,
    /** How much of its distance from the orb a speck keeps at full pull (0 = on the orb). */
    KEEP: 0.2,
  },
  /** Places of power keep their own small clouds of life (L7 places them): a look per kind of cloud. */
  CLOUDS: {
    FIREFLY_SWIRL: {
      count: 36,
      shape: 'dot',
      additive: true,
      sizeM: [0.05, 0.09],
      colorA: '#d8ff7a',
      colorB: '#ffe58a',
      altColor: '#d8ff7a',
      hdr: 0.4,
      alpha: 1,
      spin: 0,
      blinkHz: 0.32,
      nightMul: 1,
      orbPullM: 12,
      style: 'swirl',
      spreadM: 6,
      heightM: 2.6,
      lifeS: 30,
      speedMps: 0,
      orbitRadPerS: 0.25,
      wobbleM: 0.6,
      wobbleHz: 0.2,
    },
    DUST_RISE: {
      count: 60,
      shape: 'dot',
      additive: true,
      sizeM: [0.025, 0.05],
      colorA: '#d9cfae',
      colorB: '#ffffff',
      altColor: '#ffffff',
      hdr: 0.06,
      alpha: 0.6,
      spin: 0,
      blinkHz: 0,
      nightMul: 1,
      orbPullM: 0,
      style: 'rise',
      spreadM: 3.5,
      heightM: 7,
      lifeS: 22,
      speedMps: 0.6,
      orbitRadPerS: 0,
      wobbleM: 0.5,
      wobbleHz: 0.15,
    },
    LEAF_SHED: {
      count: 40,
      shape: 'leaf',
      additive: false,
      sizeM: [0.1, 0.2],
      colorA: '#5d7f34',
      colorB: '#8aa64a',
      altColor: '#b8702c',
      hdr: 1,
      alpha: 0.95,
      spin: 4,
      blinkHz: 0,
      nightMul: 0.12,
      orbPullM: 0,
      style: 'shed',
      spreadM: 3,
      heightM: 9,
      lifeS: 16,
      speedMps: 2.4,
      orbitRadPerS: 0,
      wobbleM: 0.5,
      wobbleHz: 0.35,
    },
  },
  /**
   * Farm animals: cosmetic, never saved (a load starts them fresh in their pasture or yard). They appear when the
   * village is converted, in numbers that follow its population, and they never leave once they are there.
   */
  ANIMALS: {
    /** Beyond this distance (m) from the camera animals are not drawn. */
    DRAW_DISTANCE_M: 160,
    /** Seconds an animal takes to grow into view when it arrives (a new lamb, a hen from the market). */
    ARRIVE_S: 2.5,
    SHEEP: {
      /** One sheep per this many villagers, between `MIN` and `MAX` (a village of one still has a few). */
      PER_VILLAGERS: 6,
      MIN: 3,
      MAX: 8,
      /** The pasture: a disc this big, found beyond the buildings, clear of water and steep ground. */
      PASTURE_RADIUS_M: 9,
      WALK_MPS: 0.55,
      RUN_MPS: 2.4,
      /** Seconds a sheep grazes between walks, and how fast it turns (rad/s). */
      REST_S: [7, 18],
      TURN_RAD_S: 3,
      /** Metres of travel per stride cycle. */
      STRIDE_M: 0.7,
      /** Sheep keep at least this far from each other, and the blob shadow's size. */
      GAP_M: 0.9,
      BLOB: 1.5,
    },
    CHICKEN: {
      PER_VILLAGERS: 4,
      MIN: 4,
      MAX: 12,
      YARD_RADIUS_M: 3.5,
      WALK_MPS: 0.45,
      RUN_MPS: 3.2,
      REST_S: [2, 6],
      TURN_RAD_S: 8,
      STRIDE_M: 0.22,
      GAP_M: 0.35,
      BLOB: 0.55,
      /** Hens within this distance of the orb scatter from it, once the world is alive (Phase 1+). */
      SCARE_RADIUS_M: 5,
    },
  },
  /** How trees are counted into the habitat grid that leaves and fireflies read: cell size (m) and trees for a full cell. */
  HABITAT: {
    CELL_M: 32,
    FULL_TREES_PER_CELL: 10,
    /** Seconds the camera's local habitat takes to follow (so crossing a glade does not flicker the count). */
    FOLLOW_S: 2.5,
  },
} as const;
