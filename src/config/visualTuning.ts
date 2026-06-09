// src/config/visualTuning.ts — canonical visual defaults (production + dev panel)
// Tune the look here. phase0.ts, skyDefaults.ts, and *DevDefaults re-export for compatibility.

/** AgX exposure at full day reveal — keep in sync with sky.day.exposure. */
const TONE_MAPPING_EXPOSURE = 0.6;

/** Energy reveal sun elevation (degrees); night HDRI fade should match this span. */
const SUN_ELEVATION_NIGHT = -2;
const SUN_ELEVATION_DAY = 10;

export type WaterTier = 'reflective' | 'cheap';

export const VISUAL = {
  /** Sun shadow map tuning — shared by terrain, grass, trees, god rays. */
  lighting: {
    /** PCFSoftShadowMap penumbra (DirectionalLightShadow.radius). */
    shadowSoftness: 2,
    shadowBias: -0.0002,
    /** Slightly higher than tree props — reduces acne on self-shadowing terrain slopes. */
    shadowNormalBias: 0.025,
    useSoftShadowMap: true,
  },
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
    /** Full sun arc after energy reveal completes (dawn → peak → sunset). */
    cycle: {
      peakElevationDeg: 58,
      dayDurationSec: 120,
      sunsetElevationDeg: SUN_ELEVATION_NIGHT,
      loop: false,
    },
    /** AgX (ground) vs SkyMesh multiplier curves keyed on sun elevation. */
    exposureCurve: {
      groundLow: 1,
      groundHigh: TONE_MAPPING_EXPOSURE,
      skyLow: 1.0,
      skyHigh: 0.4,
    },
    /**
     * Night sky EXR + PMREM env.
     * fadeElevationStart/End: full HDRI at/below start, off at/above end (sun °).
     * crossfadeSkyMesh: Preetham SkyMesh visible while HDRI weight &lt; 1; false = SkyMesh only after HDRI is fully off.
     */
    nightHdri: {
      path: 'textures/environment/night-sky.exr',
      intensity: 0.4,
      rotationY: 0,
      fadeElevationStart: SUN_ELEVATION_NIGHT,
      fadeElevationEnd: 15,
      crossfadeSkyMesh: true,
    },
    /** Curve endpoints for sampleLighting — not per-frame literals. */
    revealLighting: {
      nightSky: 0.12,
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
    /** Low sun: less sky bloom attenuation (more bloom). High sun: stronger cut (less sky bloom). */
    SKY_REDUCE_LOW: 0.2,
    SKY_REDUCE_HIGH: 0.75,
    /** @deprecated Use SKY_REDUCE_LOW — kept for dev panel default label. */
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
  /** Player orb ground glow — energy expands the ring once; after cap, day phase fades it. */
  player: {
    illuminationNight: 0.2,
    illuminationDay: 0.02,
    /** Exponential smooth when the ring grows (orb absorbed). Higher = snappier. */
    illuminationGrowSmooth: 3.5,
    /** Exponential smooth when the ring shrinks (day fade / cap handoff). Lower = gentler. */
    illuminationShrinkSmooth: 1,
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
    /** `reflective` = planar reflector; `cheap` = normal-map only (no extra scene pass). */
    tier: 'reflective' as WaterTier,
    /** Reflector render-target downscale ceiling (see WATER_PARAMS.resolutionScale). */
    resolutionScale: 0.33,
    /** Shore shadows on water are imperceptible at gameplay distances — saves GPU. */
    receiveShadow: false,
    size: 4,
    alpha: 0.9,
    distortionDay: 3.7,
    distortionNight: 8,
    adaptive: {
      minScale: 0.15,
      /** Minimum scale weight inland (never fully off while reflective tier is active). */
      inlandFloor: 0.2,
      shoreDistanceStart: 25,
      shoreDistanceEnd: 80,
      pitchLowDeg: -5,
      pitchHighDeg: 15,
      daylightNight: 0.15,
      dampLambda: 6,
    },
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
    /** Render mesh subdivisions (PlaneGeometry). Higher = finer vertex displacement; map sculpt grid stays at WORLD.SEGMENTS. */
    meshSegments: 768,
    /** Per-atlas-slot texture tuning (tile repeat, detail disp, normals, roughness). */
    biomes: {
      shore: { tileRepeat: 0.055, detailDisplacement: 0.4, normalStrength: 1, roughness: 1 },
      forest: { tileRepeat: 0.15, detailDisplacement: 0.3, normalStrength: 2, roughness: 1.1 },
      hills: { tileRepeat: 0.1, detailDisplacement: 0.9, normalStrength: 0.65, roughness: 0.7 },
      mountain: { tileRepeat: 0.05, detailDisplacement: 1, normalStrength: 1, roughness: 0.5 },
      path: { tileRepeat: 0.12, detailDisplacement: 0.6, normalStrength: 1.2, roughness: 0.85 },
      meadow: { tileRepeat: 0.2, detailDisplacement: 0.1, normalStrength: 2, roughness: 1.3 },
      snow: { tileRepeat: 0.065, detailDisplacement: 0.2, normalStrength: 1, roughness: 0.25 },
    },
    snow: {
      heightStart: 0.78,
      heightEnd: 0.92,
      mountainWeight: 0.85,
    },
    /** DEV: prefer JPG displacement when probing Poly Haven disp files. */
    preferredDispFormat: 'jpg' as const,
    displacementEnabled: true,
    /** Grid-cell blur radius when baking painted biome weights (~2–3 m at default grid). */
    biomeBlendRadiusCells: 3,
    /** Min lit fraction in full tree shadow on terrain sun terms (0 = black, 1 = no darkening). */
    shadowFloor: 0.06,
    /** Sculpted terrain mesh draws into the sun shadow map (hill → valley shadows). */
    castShadow: true,
  },
  /** Player-follow GPU grass — three independent LOD ring fields. */
  grass: {
    rings: [
      { radius: 17, densityPerM2: 300, bladeWidth: 0.02, segments: 4 },
      { radius: 30, densityPerM2: 60, bladeWidth: 0.05, segments: 1 },
      { radius: 120, densityPerM2: 50, bladeWidth: 0.075, segments: 1 },
    ],
    /** Safety cap on bladesPerSide² per ring. */
    maxInstancesPerRing: 600_000_000,
    bladeHeight: 0.5,
    windStrength: 0.27,
    windSpeed: 0.1,
    bladeMinScale: 0.94,
    bladeMaxScale: 3,
    /** NDC frustum padding (Revo-style compute cull). Keep Y pads modest + balanced. */
    cullPadNdcX: 0.075,
    cullPadNdcYNear: 0.2,
    cullPadNdcYFar: 0.2,
    baseColor: '#818932',
    tipColor: '#35b143',
    colorMixFactor: 0.125,
    colorVariationStrength: 3.5,
    aoScale: 0,
    aoRimSmoothness: 0,
    aoRadius: 0,
    baseWindShade: 0.75,
    baseShadeHeight: 1,
    baseBending: 3,
    biomeGrassThreshold: 0.25,
    /** Normalized grass-weight range above threshold for full density/height. */
    biomeGrassFadeWidth: 0.8,
    /** Minimum blade height multiplier at biome transition edges. */
    transitionMinBladeScale: 0.35,
    /** Grid-cell blur for grass path grass mask (wider than terrain for softer path edges). */
    pathOffMaskRadiusCells: 8,
    /** Per-biome grass density multipliers (G-channel bake, 0–1 typical). */
    biomeDensity: {
      meadow: 1.0,
      forest: 0.3,
      hills: 0.1,
      shore: 0,
      mountain: 0.0,
      path: 0,
    },
    trailGrowthRate: 0.04,
    trailMinScale: 0.25,
    trailRadius: 0.9,
    trailKDown: 0.4,
    playerGlowMul: 0.35,
    /**
     * Min lit fraction in full tree shadow on grass albedo (0 = black, 1 = no darkening).
     * Higher than terrain.shadowFloor — grass multiplies base color, terrain only dims sun terms.
     */
    shadowFloor: 0.35,
    /** Night albedo floor — distant grass recedes like ground at night. */
    nightColorFloor: 0.06,
    /** Lifts blades slightly above terrain Y to reduce z-fighting on steep slopes. */
    surfaceBias: 0.04,
    flowers: {
      enabled: true,
      /** Single field spanning LOD0 + LOD1 (through mid ring outer edge). */
      flowersPerSide: 50,
      minScale: 0.075,
      maxScale: 0.135,
      boundsRadius: 1.0,
      grassThreshold: 0.25,
      color1: '#051f54',
      color2: '#fc9400',
      colorStrength: 0.26,
      /** Vertical lift above terrain (m), after sprite pivot. */
      heightOffset: 0.65,
    },
  },
} as const;
