// src/config/visualTuning.ts — canonical visual defaults (production + dev panel)
// Tune the look here. phase0.ts, skyDefaults.ts, and *DevDefaults re-export for compatibility.

/** AgX exposure at full day reveal — keep in sync with sky.day.exposure. */
const TONE_MAPPING_EXPOSURE = 0.1;

/** Energy reveal sun elevation (degrees); night HDRI fade should match this span. */
const SUN_ELEVATION_NIGHT = -2;
const SUN_ELEVATION_DAY = 10;

export const VISUAL = {
  sky: {
    night: {
      turbidity: 10,
      rayleigh: 3,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.7,
      cloudCoverage: 0,
      exposure: 0.6,
    },
    day: {
      turbidity: 10,
      rayleigh: 1.5,
      mieCoefficient: 0.004,
      mieDirectionalG: 0.6,
      cloudCoverage: 0.25,
      exposure: TONE_MAPPING_EXPOSURE,
    },
    static: {
      fogDensity: 0.0016,
      cloudDensity: 0.35,
      cloudElevation: 0.45,
      showSunDisc: 1,
    },
    sun: {
      azimuthDeg: 180,
      lightDistance: 50,
    },
    reveal: {
      elevationNight: SUN_ELEVATION_NIGHT,
      elevationDay: SUN_ELEVATION_DAY,
      revealDuration: 20,
    },
    /**
     * Night sky EXR + PMREM env.
     * fadeElevationStart/End: full HDRI at/below start, off at/above end (sun °). End may exceed elevationDay to keep EXR after reveal.
     * crossfadeSkyMesh: Preetham SkyMesh visible while HDRI weight &lt; 1; false = SkyMesh only after HDRI is fully off.
     */
    nightHdri: {
      path: 'textures/environment/night-sky.exr',
      intensity: 0.7,
      rotationY: 0,
      fadeElevationStart: SUN_ELEVATION_NIGHT,
      fadeElevationEnd: 25,
      crossfadeSkyMesh: true,
    },
    revealLighting: {
      nightSky: 0.12,
      sunIntensityMax: 1.6,
      ambientMin: 0.04,
      ambientMax: 0.9,
    },
  },
  bloom: {
    SMOOTH_WIDTH: 0.045,
    STRENGTH: 0.4,
    STRENGTH_HIGH: 1.45,
    RADIUS: 0.1,
    RADIUS_HIGH: 0.48,
    SCENE_THRESHOLD: 0.35,
    SCENE_STRENGTH_MUL: 0.2,
    SKY_DEPTH_START: 0.935,
    SKY_DEPTH_END: 1,
    SKY_SUN_LUMA_START: 0.4,
    SKY_SUN_LUMA_END: 1.6,
    SKY_REDUCE: 0.2,
    HDR_SCALE: 12,
    PLAYER_EMISSIVE: 1.25,
    RESOLUTION_SCALE_HIGH: 1.0,
  },
  dof: {
    ENABLED: true,
    /** Added to auto focus distance (camera → player, world units). */
    FOCUS_DISTANCE_OFFSET: 3,
    FOCAL_LENGTH: 75,
    /** Bokeh at 0% energy (night / start) → 100% energy (full reveal). */
    BOKEH_SCALE_START: 8,
    BOKEH_SCALE_END: 2,
    /** Exponential smooth for focus distance (higher = snappier). */
    FOCUS_SMOOTH: 10,
  },
  godrays: {
    DENSITY_BASE: 2,
    MAX_DENSITY_BASE: 4,
    INTENSITY_MUL: 2,
    WEIGHT_MIN: 0.35,
    WEIGHT_MAX: 1,
    BLUR_SIGMA: 4,
    BLUR_SIGMA_COLOR: 0.12,
    EDGE_RADIUS: 2,
    EDGE_STRENGTH: 2,
    TINT_R: 1.28,
    TINT_G: 1.02,
    TINT_B: 0.82,
    SKY_LUMA_START: 0.4,
    SKY_LUMA_END: 1.4,
    SUN_FACING_MIN: 0.75,
    SUN_FACING_MAX: 1,
    SUN_INTENSITY_REF: 1.6,
    ELEV_RAY_FALLOFF: 55,
    ELEV_FACTOR_MIN: 0.45,
    ELEV_FACTOR_MAX: 0.95,
  },
  render: {
    toneMappingExposure: TONE_MAPPING_EXPOSURE,
  },
  water: {
    /** Reflector render-target downscale (see WATER_PARAMS.resolutionScale). */
    resolutionScale: 0.5,
    size: 4,
    alpha: 0.9,
    distortionDay: 3.7,
    distortionNight: 8,
  },
  clouds: {
    ringRotationDeg: 0,
    rotationJitter: 1,
    nightAlphaMul: 0.2,
    alphaPower: 2.2,
    colorDayThreshold: 0.35,
    nightTintDarkness: 0.85,
    rings: [
      {
        rCenter: 550,
        rSpread: 65,
        clusters: 80,
        staggeredClusters: 29,
        layersPerCluster: 3,
        puffOpacity: 0.88,
        puffAlphaMin: 0.38,
        puffAlphaMax: 1,
      },
      {
        rCenter: 360,
        rSpread: 95,
        clusters: 52,
        staggeredClusters: 15,
        layersPerCluster: 1,
        puffOpacity: 0.26,
        puffAlphaMin: 0.38,
        puffAlphaMax: 1,
      },
      {
        rCenter: 230,
        rSpread: 115,
        clusters: 32,
        staggeredClusters: 45,
        layersPerCluster: 1,
        puffOpacity: 0.78,
        puffAlphaMin: 0.38,
        puffAlphaMax: 0.82,
      },
    ],
  },
  terrain: {
    textureRepeat: 0.08,
    displacementScale: 0.45,
    normalStrength: 1.0,
    aoStrength: 0.85,
    specularStrength: 0.35,
    slopeRockStart: 0.75,
    displacementEnabled: true,
  },
  /** Player-follow GPU grass (SpriteNodeMaterial + compute). */
  grass: {
    bladesPerSide: 320,
    windStrength: 0.35,
    windSpeed: 0.22,
    bladeMinScale: 0.75,
    bladeMaxScale: 1.85,
    thinningR0: 8,
    thinningR1: 42,
    thinningPMin: 0.12,
    cullPadNdcX: 0.075,
    cullPadNdcYNear: 0.75,
    cullPadNdcYFar: 0.2,
    baseColor: '#8c6e30',
    tipColor: '#4a7a14',
    colorMixFactor: 0.125,
    colorVariationStrength: 2.5,
    aoScale: 0.5,
    aoRimSmoothness: 5,
    aoRadius: 22,
    baseWindShade: 0.75,
    baseShadeHeight: 1,
    baseBending: 1.8,
    biomeGrassThreshold: 0.08,
    trailGrowthRate: 0.04,
    trailMinScale: 0.25,
    trailRadius: 0.9,
    trailKDown: 0.4,
    playerGlowMul: 0.35,
  },
} as const;
