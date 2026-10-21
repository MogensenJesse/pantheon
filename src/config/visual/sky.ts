// src/config/visual/sky.ts — Preetham, HDRI, day cycle, lighting curves

import { GAME_DAY_S } from '../clock.ts';

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
    daylightFactor: 0.22,
    sunIntensity: 0.9,
    ambientIntensity: 0.14,
    globalExposure: 0.95,
    skyExposure: 0.36,
  },
  noon: {
    daylightFactor: 1,
    sunIntensity: 1.4,
    ambientIntensity: 0.55,
    globalExposure: 0.92,
    skyExposure: 0.38,
  },
} as const;

/** Neutral light colors (former fixed SceneSetup sun / ambient). */
const LIGHT_COLOR_REFERENCE = { sun: '#FFECD0', ambient: '#E8DFC8' } as const;

/** Per-stop key / fill light colors — sampled via todWeights. */
const LIGHT_COLOR_STOPS = {
  night: { sun: '#8FA8D8', ambient: '#3A4A78' },
  goldenHour: { sun: '#FFC890', ambient: '#5A6A9A' },
  noon: { sun: '#FFF6E8', ambient: '#C0DCF4' },
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
    turbidity: 8,
    rayleigh: 1.85,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.75,
    /** Near-neutral multiply so Rayleigh blue stays; warmth comes from Mie + land. */
    tint: '#E8F4FF',
  },
  noon: {
    turbidity: 3.5,
    rayleigh: 0.9,
    mieCoefficient: 0.002,
    mieDirectionalG: 0.7,
    tint: '#A8D8F8',
  },
  static: {
    showSunDisc: 1,
    /**
     * r186 SkyMesh procedural skydome clouds (three.js webgpu_sky demo defaults).
     * Separate from world MeshCloudSystem soft clouds.
     */
    skyMeshClouds: {
      cloudCoverage: 0.25,
      cloudDensity: 0.2,
      cloudElevation: 0.5,
      cloudScale: 0.0002,
      /** Dome billow. Travel follows the deck wind, not this value. */
      cloudSpeed: 0.00005,
    },
  },
  sun: {
    lightDistance: 420,
  },
  nightBaseline: {
    elevationNight: BELOW_HORIZON_ELEVATION_DEG,
  },
  cycle: {
    peakElevationDeg: 35,
    dayDurationSec: GAME_DAY_S,
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
  /** Per-stop key (sun) / fill (ambient) light colors (todWeights). */
  lightColors: LIGHT_COLOR_STOPS,
  /** Light colors props treat as neutral (their sun/ambient tint = live color ÷ this). */
  lightColorReference: LIGHT_COLOR_REFERENCE,
  nightHdri: {
    path: '/textures/environment/night-sky.exr',
    intensity: 0.1,
    rotationY: 0,
    fadeElevationStart: BELOW_HORIZON_ELEVATION_DEG,
    /** Slightly above the horizon so the night sky backs the dusk instead of a dark Preetham. */
    fadeElevationEnd: 1.5,
    crossfadeSkyMesh: true,
    /** EXR horizon luma dim (fog tint is atmosphere.haze, after intensity). */
    horizonDim: {
      start: 0.005,
      end: 0.325,
      min: 0.1,
    },
  },
  /**
   * Dusk sky: as the sun sinks from startDeg to endDeg, lerp the Preetham dome color toward the
   * aurora shader's base gradient so dusk converges on the night blue instead of dipping to black.
   */
  duskSkyLerp: {
    enabled: true,
    startDeg: 0.5,
    endDeg: BELOW_HORIZON_ELEVATION_DEG,
    /** Max lerp weight (1 = fully the aurora base color at endDeg). */
    strength: 1,
    /** Scales the aurora base color (compensates lower dusk exposure vs full night). */
    gain: 1,
  },
  /**
   * Twilight afterglow: additive horizon glow on every sky background (Preetham, aurora, HDRI)
   * while the sun is just below the horizon. Warm on the sun side, rose "Belt of Venus" opposite.
   */
  afterglow: {
    enabled: true,
    /** Sun ° where the glow starts ramping in (above the horizon, under golden hour). */
    startDeg: 1,
    /** Sun ° of full glow. */
    peakDeg: -1.5,
    /** Sun ° where the glow is gone (full night). */
    endDeg: BELOW_HORIZON_ELEVATION_DEG,
    /** Additive strength at peak (pre-tonemap). */
    strength: 0.1,
    /** View-dir y where the band fades out (0 = horizon, 1 = zenith). */
    bandHeight: 0.5,
    /** >1 tightens the warm lobe around the sun azimuth. */
    sunSidePower: 8,
    sunSideColor: '#FF8A50',
    antiSunColor: '#B87090',
    /** Opposite-side (Belt of Venus) strength relative to the sun side. */
    antiSunStrength: 0.35,
  },
  /** Procedural Nimitz aurora night background (supersedes HDRI skybox when enabled). */
  nightAurora: {
    enabled: true,
    intensity: 0.1,
    auroraStrength: 1,
    starStrength: 1,
    timeScale: 1.5,
  },
  /** Night lift as phase 0 fills (energy over the cap; full from the sunrise on). */
  worldLightness: {
    daylightLift: 0.2,
    ambientLift: 0.1,
    groundExposureLift: 0.15,
    skyExposureLift: 0.08,
  },
} as const;
