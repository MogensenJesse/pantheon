// src/config/visual/sky.ts — Preetham, HDRI, day cycle, lighting curves

/** Below-horizon sun ° — night bands, HDRI fade, lighting floor. */
export const BELOW_HORIZON_ELEVATION_DEG = -5;

/** AgX/sky brightness vs elevation; groundHigh = noon AgX. */
export const SKY_EXPOSURE_CURVE = {
  groundLow: 2.5,
  groundHigh: 1,
  skyLow: 1.0,
  skyHigh: 0.25,
} as const;

export const sky = {
  night: {
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
  },
  day: {
    turbidity: 10,
    rayleigh: 1.5,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.6,
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
    /** Sharpness of goldenHourT peak — shared by grade, terrain, clouds, bloom, godrays. */
    goldenHourPower: 1.4,
  },
  exposureCurve: SKY_EXPOSURE_CURVE,
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
  lightingCurve: {
    nightDaylightFloor: 0.12,
    sunIntensityMax: 1.6,
    ambientMin: 0.04,
    ambientMax: 0.9,
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
