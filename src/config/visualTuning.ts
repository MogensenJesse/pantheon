// src/config/visualTuning.ts — canonical visual defaults (production + dev panel)
// Tune the look here. phase0.ts, skyDefaults.ts, and *DevDefaults re-export for compatibility.

/** AgX exposure at full day — keep in sync with sky.day.exposure and exposureCurve.groundHigh. */
const TONE_MAPPING_EXPOSURE = 0.6;

/** Below-horizon sun elevation (°) — night bands, HDRI fade start, lighting floor. */
const BELOW_HORIZON_ELEVATION_DEG = -5;

export type WaterTier = 'reflective' | 'cheap';

/** Sun shadow map quality — shared cast + god rays. */
const SHADOW_LIGHTING = {
  /** Directional shadow map resolution (square — width and height). */
  mapSize: 4096,
  /** Vogel-disk PCF radius in shadow-map texels (WebGPU — see configureSunShadowFilter). */
  shadowSoftness: 4,
  shadowBias: 0.001,
  /** Slightly higher than tree props — reduces acne on self-shadowing terrain slopes. */
  shadowNormalBias: 0.05,
  /** Snap follow target to shadow-map texels — reduces swimming when the player moves. */
  stabilizeShadowMap: true,
  /**
   * Legacy flag — WebGPU always uses radius-aware PCF (configureSunShadowFilter).
   * PCFSoftShadowMap ignores shadow.radius on TSL receivers.
   */
  useSoftShadowMap: false,
} as const;

/** Per-receiver shadow receive tunables — canonical source for shadow floors. */
const SHADOW_RECEIVERS = {
  terrain: {
    /** Min lit fraction in full tree shadow on terrain sun terms (0 = black, 1 = no darkening). */
    shadowFloor: 0.06,
  },
  grass: {
    /**
     * Min lit fraction in full tree shadow on grass albedo (0 = black, 1 = no darkening).
     * Higher than terrain — grass multiplies base color, terrain only dims sun terms.
     */
    shadowFloor: 0.35,
  },
  props: {
    /** Min lit fraction in full sun shadow on the direct-sun term (ambient base stays bright). */
    shadowFloor: 0.4,
    /** How much softened sun shadow darkens albedo (0 = off, 1 = full multiply). */
    shadowStrength: 0.9,
    /** PCF edge softening — wider band reduces shimmer on alpha-cutout foliage. */
    shadowSmoothMin: 0.1,
    shadowSmoothMax: 0.9,
    /** Lift shadow sample on Y to reduce self-shadow acne on billboard cards. */
    shadowSampleLiftM: 0.12,
    nightColorFloor: 0.06,
    playerGlowMul: 0.35,
  },
  water: {
    /** Min lit fraction in full tree shadow on water (0 = black, 1 = no darkening). */
    shadowFloor: 0.08,
  },
} as const;

/** Prop foliage shape lighting — wrap diffuse + hemisphere (mapPropShadingTsl). */
const FOLIAGE_LIGHTING = {
  /** Half-Lambert mix on sun-facing vs tilted cards (0 = flat, 1 = full wrap). */
  wrapStrength: 1,
  /** Sky/ground ambient tint by world normal Y (0 = off). */
  hemisphereStrength: 0.6,
  /** Multiplier on tree leaves + soft foliage materials. */
  foliageMul: 1,
  /** Tree bark / trunk — subtle shape only. */
  barkMul: 0.35,
  /** Rocks, pebbles, paths — minimal extra shading. */
  defaultMul: 0.65,
  /** Blend glTF vertex color (bark AO); leaves are white in Nature Pack. */
  vertexColorMul: 1,
  skyTint: '#c8d8f0',
  groundTint: '#3d4a32',
} as const;

/** Grass + flower wrap diffuse + hemisphere (grassMaterial, flowerMaterial). */
const GRASS_FOLIAGE_LIGHTING = {
  wrapStrength: 0.55,
  hemisphereStrength: 0.38,
  skyTint: '#c8d8f0',
  groundTint: '#3d4a32',
  backlightStrength: 0.65,
  backlightPunchThrough: 0.2,
  backlightTint: '#f0d99c',
} as const;

/** Valley + distance fog via scene.fogNode (valleyFog.ts — webgpu_custom_fog pattern). */
const ATMOSPHERE_HAZE = {
  enabled: true,
  /** densityFogFactor density — distant dissolve (example ~0.0012). */
  hazeDensity: 0.002,
  /** World Y — solid fog below (valley floor). */
  fogBase: 8,
  /** World Y — band fades out by at night (mid-hills / mist ceiling). */
  fogTop: 27,
  /** World Y — band top recedes to this on clear day (before cycle lift at dusk). */
  fogTopDay: 14,
  bandStrength: 0.98,
  noiseScaleA: 0.005,
  noiseScaleB: 0.02,
  noiseAmplitude: 26,
  /** 0 = static band, 1 = full triNoise3D wisp animation. */
  noiseStrength: 0.33,
  nightColor: '#1a2230',
  dayColor: '#d0dee7',
  /** Sun elevation (°) at/above which fog/haze master ≈ 0 (clear midday). */
  clearElevationDeg: 20,
  /** Sun elevation (°) at/below which fog/haze master = 1 (night / deep dusk). */
  fullElevationDeg: -5,
  /** >1 keeps afternoons clearer longer before mist builds (1 = linear ramp). */
  cyclePower: 1.4,
} as const;

export const VISUAL = {
  atmosphere: {
    haze: ATMOSPHERE_HAZE,
  },
  /** Sun shadow map + per-receiver receive tuning. */
  shadows: {
    lighting: SHADOW_LIGHTING,
    receivers: SHADOW_RECEIVERS,
  },
  /** Sun shadow map tuning — alias of VISUAL.shadows.lighting (SceneSetup, dev panel). */
  lighting: SHADOW_LIGHTING,
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
      cloudDensity: 0.35,
      cloudElevation: 0.45,
      showSunDisc: 1,
    },
    sun: {
      lightDistance: 50,
    },
    /** Pre-reveal night sun elevation + lighting floor (matches cycle.sunriseElevationDeg). */
    nightBaseline: {
      elevationNight: BELOW_HORIZON_ELEVATION_DEG,
    },
    /** Full midnight→midnight loop after energy reveal (compressed game time). */
    cycle: {
      peakElevationDeg: 58,
      dayDurationSec: 120,
      sunsetElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
      /** Sun elevation at cycle sunrise (below horizon). */
      sunriseElevationDeg: BELOW_HORIZON_ELEVATION_DEG,
      loop: true,
      sunrisePhase: 0.25,
      /** Sunrise anchor — azimuth sweeps east→west one full turn per cycle (left→right on screen). */
      azimuthEast: 270,
    },
    /**
     * AgX (ground) vs SkyMesh multiplier curves keyed on sun elevation.
     * groundLow/skyLow are higher than groundHigh/skyHigh — compensates dark nights (not a bug).
     */
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
  },
  bloom: {
    SMOOTH_WIDTH: 0.045,
    STRENGTH: 0.4,
    RADIUS: 0.1,
    SCENE_THRESHOLD: 0.35,
    SCENE_STRENGTH_MUL: 0.2,
    SKY_DEPTH_START: 0.935,
    SKY_DEPTH_END: 1,
    SKY_SUN_LUMA_START: 0.4,
    SKY_SUN_LUMA_END: 1.6,
    /** Low sun: less sky bloom attenuation (more bloom). High sun: stronger cut (less sky bloom). */
    SKY_REDUCE_LOW: 0.2,
    SKY_REDUCE_HIGH: 0.75,
    HDR_SCALE: 12,
    PLAYER_EMISSIVE: 1.25,
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
    receiveShadow: true,
    /** Min lit fraction in full tree shadow on water — see VISUAL.shadows.receivers.water. */
    shadowFloor: SHADOW_RECEIVERS.water.shadowFloor,
    size: 4,
    alpha: 1,
    distortionDay: 3.7,
    distortionNight: 8,
    /** Radial opacity falloff — full inside start×radius, transparent at end×radius. */
    edgeFadeStartRatio: 0.72,
    edgeFadeEndRatio: 1.0,
    adaptive: {
      minScale: 0.15,
      /** Minimum importance weight inland (0 = reflector can fully idle). */
      inlandFloor: 0,
      shoreDistanceStart: 25,
      shoreDistanceEnd: 80,
      /** Radial probe for nearest submerged terrain (replaces map-edge heuristic). */
      coastProbeDirs: 12,
      coastProbeStepM: 32,
      coastMaxSearchM: 192,
      /** Below this combined importance, reflection mix and RT scale go to 0. */
      reflectorCutoff: 0.08,
      /** Smallest valid reflector RT scale — must stay > 0 (WebGPU rejects 0×0 targets). */
      reflectorIdleScale: 0.05,
      pitchLowDeg: -5,
      pitchHighDeg: 15,
      daylightNight: 0.15,
      dampLambda: 6,
    },
    /** Terrain-height shore clip + Beer-Lambert depth opacity + shallow teal tint (waterDepthTsl). */
    shoreDepth: {
      enabled: true,
      /** Beer-Lambert absorption k — higher = opaque sooner with depth. */
      absorption: 0.6,
      /** Smooth coast fade (m) when terrain rises above water plane. */
      coastFadeM: 1,
      /** Shallow teal falloff depth (m) — exp(-depth / shallowDepthM). */
      shallowDepthM: 4,
      /** Refraction mask falloff (m) — independent of absorption; exp(-depth / refractionDepthM). */
      refractionDepthM: 6,
      shallowColor: '#2a8a7a',
      shallowColorNight: '#0d3d35',
      /** In sun shadow, lerp shallow opacity toward 1 so dark water does not reveal terrain below. */
      shadowOpacityBoost: 0.6,
      /** Screen-space refraction mix at full refraction mask (viewportSharedTexture). */
      refractionStrength: 1,
      /** Multiplier on screen-space refraction UV warp. */
      refractionOffset: 5,
      /** Opacity lerp toward 1 when refracting — blocks static terrain alpha passthrough (use 1). */
      refractionOpacity: 1,
      /** Reduce valley fog over shallow refracting water (0 = full fog, 1 = no fog at shore). */
      fogBypassStrength: 0.9,
    },
    /** Gentle tidal bob + terrain shore intersection stripe (Codrops-style, no surface foam bands). */
    tide: {
      enabled: true,
      waveSpeed: 0.7,
      /** Meters — whole water disc oscillates on Y. */
      waveAmplitude: 0.25,
      /** Shore foam stripe thickness (m). */
      foamDepth: 0.09,
      foamColor: '#ffffff',
      /** World-XZ ripple on the foam waterline (m). */
      foamRippleAmplitude: 0.07,
      /** Ripple spatial frequency along the shore (higher = tighter chop). */
      foamRippleScale: 0.5,
      /** Ripple scroll speed — ties visually to surface water motion. */
      foamRippleSpeed: 3,
      /** Slow world-XZ patch field — thick opaque foam vs thin translucent (0 = uniform). */
      foamPatchVariation: 1,
      /** Patch spatial scale (lower = larger foam blobs along the shore). */
      foamPatchScale: 0.35,
      /** Stripe opacity at thin patch troughs (thick patches → 1). */
      foamOpacityMin: 0.5,
      /** Stripe thickness multiplier at thin patch troughs (thick patches → 1). */
      foamDepthMinRatio: 0.9,
      /** Suppress foam stripe under valley fog (1 = gone at full haze). */
      foamFogHazeStrength: 1,
      /** Lerp foam white toward fog color as haze builds. */
      foamFogColorTint: 0.5,
      /** Pull foam waterline down (m) so stripe overlaps the water surface. */
      foamWaterlineBias: -0.05,
    },
  },
  terrain: {
    /** Render mesh subdivisions (PlaneGeometry). ~12 texels/vertex on path cobbles needs ≥4k; 2k is a perf compromise. */
    meshSegments: 4096,
    /** Map editor terrain subdivisions — lower vertex count for sculpt/paint. */
    editorMeshSegments: 256,
    /** Per-atlas-slot texture tuning (tile repeat, detail disp, normals, roughness). */
    biomes: {
      shore: { tileRepeat: 0.055, detailDisplacement: 0.4, normalStrength: 1, roughness: 1 },
      forest: { tileRepeat: 0.15, detailDisplacement: 0.3, normalStrength: 2, roughness: 1.1 },
      hills: { tileRepeat: 0.1, detailDisplacement: 0.9, normalStrength: 0.65, roughness: 0.7 },
      mountain: { tileRepeat: 0.05, detailDisplacement: 1, normalStrength: 1, roughness: 0.5 },
      path: { tileRepeat: 0.12, detailDisplacement: 0.07, normalStrength: 1.2, roughness: 0.85 },
      meadow: { tileRepeat: 0.2, detailDisplacement: 0, normalStrength: 2, roughness: 1.3 },
      snow: { tileRepeat: 0.065, detailDisplacement: 0.2, normalStrength: 1, roughness: 0.25 },
    },
    snow: {
      heightStart: 0.78,
      heightEnd: 0.92,
      mountainWeight: 0.85,
    },
    /** DEV: prefer JPG displacement when probing Poly Haven disp files. */
    preferredDispFormat: 'jpg' as const,
    /** Probe/load order when both resolutions exist — `1k` when only *_disp_1k.* are shipped. */
    preferredDispResolution: '1k' as const,
    displacementEnabled: true,
    /** worldNormal.y below this → full tangent normals for lighting. */
    plateauFlatnessStart: 0.9,
    /** worldNormal.y above this → geometric normal for lighting (reduces plateau shimmer). */
    plateauFlatnessEnd: 0.97,
    /** Grid-cell blur radius when baking painted biome weights (~2–3 m at default grid). */
    biomeBlendRadiusCells: 3,
    /** Min lit fraction in full tree shadow on terrain sun terms — see VISUAL.shadows.receivers.terrain. */
    shadowFloor: SHADOW_RECEIVERS.terrain.shadowFloor,
    /** Sculpted terrain mesh draws into the sun shadow map (hill → valley shadows). */
    castShadow: true,
    /** Play-mode single mesh — vertex step = meshSegments / farStepMul. */
    lod: {
      /** Play mesh vertex step multiplier vs finest reference (`meshSegments`). */
      farStepMul: 8,
      /** CPU-baked shadow caster resolution (decoupled from visible play mesh). */
      shadowMeshSegments: 256,
      /** Outer detail circle (m) — detail disp fades to 0; disp-atlas samples skipped beyond. */
      detailRadiusM: 35,
      /**
       * Inner radius (m) for full detail before fade — 0 uses `detailRadiusM - layerFadeBandM`.
       * Drives both detail disp and fine/coarse layer opacity (same smoothstep).
       */
      detailDispFadeStartM: 0,
      /** Min smoothstep band (m) at the outer edge for disp + layer handoff. */
      layerFadeBandM: 8,
    },
  },
  props: {
    ...SHADOW_RECEIVERS.props,
    foliageLighting: FOLIAGE_LIGHTING,
    /** Alpha cutoff for MASK foliage — rejects soft fringe with black RGB bleed (GLTF default 0.2). */
    alphaTest: 0.45,
    /** smoothstep width above alphaTest for hardened opacityNode. */
    alphaCutoffSharpness: 0.05,
  },
  /** Player-follow GPU grass — three independent LOD ring fields. */
  grass: {
    foliageLighting: GRASS_FOLIAGE_LIGHTING,
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
    /** Min lit fraction in full tree shadow on grass — see VISUAL.shadows.receivers.grass. */
    shadowFloor: SHADOW_RECEIVERS.grass.shadowFloor,
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
      colorStrength: 0.275,
      /** Vertical lift above terrain (m), after sprite pivot. */
      heightOffset: 0.65,
      alphaTest: 0.15,
    },
  },
  /** Map editor sculpt tools (DEV only). */
  editor: {
    ridgeSculpt: {
      frequency: 1 / 48,
      octaves: 4,
      lacunarity: 2,
      gain: 0.45,
      strength: 0.06,
      smoothStrength: 0.08,
    },
  },
} as const;
