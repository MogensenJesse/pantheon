// src/config/visual/sky.ts — Preetham, HDRI, day cycle, lighting curves

/** Below-horizon sun ° — night bands, HDRI fade, lighting floor. */
export const BELOW_HORIZON_ELEVATION_DEG = -5;

/** Per-stop lighting / AgX (sampled via todWeights). */
const LIGHTING_STOPS = {
  night: {
    daylightFactor: 0.12,
    sunIntensity: 0,
    ambientIntensity: 0.04,
    globalExposure: 2.5,
    skyExposure: 1.0,
  },
  goldenHour: {
    daylightFactor: 0.45,
    sunIntensity: 0.7,
    ambientIntensity: 0.28,
    globalExposure: 1,
    skyExposure: 0.25,
  },
  noon: {
    daylightFactor: 1,
    sunIntensity: 1.6,
    ambientIntensity: 0.9,
    globalExposure: 1,
    skyExposure: 0.25,
  },
} as const;

export const sky = {
  night: {
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    tint: '#ffffff',
  },
  /** Low-sun Preetham stop — blended via VISUAL.tod golden band. */
  goldenHour: {
    turbidity: 12,
    rayleigh: 2,
    mieCoefficient: 0.003,
    mieDirectionalG: 0.5,
    tint: '#FCDBC1',
  },
  noon: {
    turbidity: 10,
    rayleigh: 1.5,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.6,
    tint: '#ffffff',
  },
  static: {
    /** Preetham dome clouds (mesh clusters = VISUAL.clouds). */
    cloudCoverage: 0.25,
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
    peakElevationDeg: 58,
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
