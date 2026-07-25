// src/config/visual/sky.ts — Preetham, HDRI, day cycle, lighting curves

/** Below-horizon sun elevation (°) — night bands, HDRI fade start, lighting floor. */
export const BELOW_HORIZON_ELEVATION_DEG = -5;

/**
 * Sun-elevation exposure endpoints — canonical AgX/sky brightness curve.
 * `groundHigh` is the single noon AgX source (`render.toneMappingExposure`, `exposureCurve.groundHigh`).
 */
export const SKY_EXPOSURE_CURVE = {
  groundLow: 2.5,
  groundHigh: 2,
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
      /** Preetham SkyMesh dome clouds (mesh clusters are VISUAL.clouds). */
      cloudCoverage: 0.25,
      cloudDensity: 0.35,
      cloudElevation: 0.45,
      /**
       * Dome UV scroll rate (independent of mesh windSpeed).
       * Direction still follows VISUAL.clouds.windDirectionDeg.
       */
      cloudSpeed: 0.00004,
      showSunDisc: 1,
    },
    sun: {
      /**
       * Distance from look-at to directional light (also places the shadow camera).
       * Must exceed mesh cloud tops (~145 m) so cloud casters stay in front of the light.
       */
      lightDistance: 420,
    },
    /** Pre-reveal night sun elevation + lighting floor (matches cycle.sunriseElevationDeg). */
    nightBaseline: {
      elevationNight: BELOW_HORIZON_ELEVATION_DEG,
    },
    /** Full midnight→midnight loop after energy reveal (compressed game time). */
    cycle: {
      peakElevationDeg: 58,
      dayDurationSec: 1800,
      sunsetElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
      /** Sun elevation at cycle sunrise (below horizon). */
      sunriseElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
      loop: true,
      sunrisePhase: 0.25,
      /** One-shot sunrise at 100% energy before the looping day/night clock. */
      revealSunrise: {
        durationSec: 20,
        targetElevationDeg: 5,
      },
      /** Sunrise anchor — azimuth sweeps east→west one full turn per cycle (left→right on screen). */
      azimuthEast: 270,
    },
    /**
     * AgX (ground) vs SkyMesh multiplier curves keyed on sun elevation.
     * groundLow/skyLow are higher than groundHigh/skyHigh — compensates dark nights (not a bug).
     */
    exposureCurve: SKY_EXPOSURE_CURVE,
    /**
     * Night sky EXR + PMREM env (shipped 4096×2048 — `npm run bake:night-exr`).
     * fadeElevationStart/End: full HDRI at/below start, off at/above end (sun °).
     * crossfadeSkyMesh: Preetham SkyMesh visible while HDRI weight &lt; 1; false = SkyMesh only after HDRI is fully off.
     */
    nightHdri: {
      path: '/textures/environment/night-sky.exr',
      intensity: 0.1,
      rotationY: 0,
      fadeElevationStart: BELOW_HORIZON_ELEVATION_DEG,
      fadeElevationEnd: 15,
      crossfadeSkyMesh: true,
      /** Faint horizon dimming on the EXR background (|viewDir.y| band, 0 = horizon). */
      horizonDim: {
        start: 0.005,
        end: 0.325,
        min: 0.1,
      },
    },
    /**
     * Elevation-driven sun/ambient/exposure curves (day cycle).
     * nightDaylightFloor also drives water day/night blend and grass initial daylight.
     */
    lightingCurve: {
      nightDaylightFloor: 0.12,
      sunIntensityMax: 1.6,
      ambientMin: 0.04,
      ambientMax: 0.9,
    },
    /** Per-orb night lift — each absorbed orb brightens subsequent nights (see lightingCurves). */
    worldLightness: {
      maxOrbs: 26,
      daylightLift: 0.2,
      ambientLift: 0.1,
      groundExposureLift: 0.15,
      skyExposureLift: 0.08,
    },
  } as const;
