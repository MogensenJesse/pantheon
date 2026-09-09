// src/config/visual/sky.ts — Preetham, HDRI, day cycle, lighting curves

/** Below-horizon sun ° — night bands, HDRI fade, lighting floor. */
export const BELOW_HORIZON_ELEVATION_DEG = -5;

/** Per-stop lighting / AgX (sampled via todWeights). */
const LIGHTING_STOPS = {
  night: {
    daylightFactor: 0.06,
    sunIntensity: 0,
    ambientIntensity: 0.035,
    globalExposure: 1.85,
    skyExposure: 0.75,
  },
  goldenHour: {
    daylightFactor: 0.5,
    sunIntensity: 1.05,
    ambientIntensity: 0.3,
    globalExposure: 1.05,
    skyExposure: 0.3,
  },
  noon: {
    daylightFactor: 1,
    sunIntensity: 1.85,
    ambientIntensity: 0.68,
    globalExposure: 0.9,
    skyExposure: 0.38,
  },
} as const;

export const sky = {
  night: {
    turbidity: 6,
    rayleigh: 2.0,
    mieCoefficient: 0.003,
    mieDirectionalG: 0.7,
    tint: '#243858',
  },
  /** Low-sun Preetham stop — blended via VISUAL.tod golden band. */
  goldenHour: {
    turbidity: 7,
    rayleigh: 1.85,
    mieCoefficient: 0.0035,
    mieDirectionalG: 0.6,
    /** Near-neutral multiply so Rayleigh blue stays; warmth comes from Mie + land. */
    tint: '#E1FFFF',
  },
  noon: {
    turbidity: 4.5,
    rayleigh: 0.52,
    mieCoefficient: 0.002,
    mieDirectionalG: 0.7,
    tint: '#B3E7F1',
  },
  static: {
    /** Preetham dome clouds (mesh clusters = VISUAL.clouds). */
    cloudCoverage: 1,
    cloudDensity: 0.35,
    cloudElevation: 0.45,
    cloudSpeed: 0.00004,
    showSunDisc: 1,
  },
  sun: {
    /** Must exceed mesh cloud tops (~145 m). */
    lightDistance: 420,
  },
  nightBaseline: {
    elevationNight: BELOW_HORIZON_ELEVATION_DEG,
  },
  cycle: {
    peakElevationDeg: 35,
    dayDurationSec: 1800,
    sunsetElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
    sunriseElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
    loop: true,
    sunrisePhase: 0.25,
    revealSunrise: {
      durationSec: 20,
      targetElevationDeg: 5,
    },
    azimuthEast: 270,
  },
  /** Per-stop sun / ambient / AgX / sky exposure (todWeights). */
  lighting: LIGHTING_STOPS,
  nightHdri: {
    path: '/textures/environment/night-sky.exr',
    intensity: 0.1,
    rotationY: 0,
    fadeElevationStart: BELOW_HORIZON_ELEVATION_DEG,
    fadeElevationEnd: 15,
    crossfadeSkyMesh: true,
    /** EXR horizon luma dim (fog tint is atmosphere.haze, after intensity). */
    horizonDim: {
      start: 0.005,
      end: 0.325,
      min: 0.1,
    },
  },
  /** Per-orb night lift after absorb. */
  worldLightness: {
    maxOrbs: 26,
    daylightLift: 0.2,
    ambientLift: 0.1,
    groundExposureLift: 0.15,
    skyExposureLift: 0.08,
  },
} as const;
