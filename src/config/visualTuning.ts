// src/config/visualTuning.ts — canonical visual defaults (production + dev panel)
// Tune the look here. phase0.ts, skyDefaults.ts, and *DevDefaults re-export for compatibility.

/** Below-horizon sun elevation (°) — night bands, HDRI fade start, lighting floor. */
const BELOW_HORIZON_ELEVATION_DEG = -5;

/**
 * Sun-elevation exposure endpoints — canonical AgX/sky brightness curve.
 * `groundHigh` is the single noon AgX source (`render.toneMappingExposure`, `exposureCurve.groundHigh`).
 */
const SKY_EXPOSURE_CURVE = {
  groundLow: 2.5,
  groundHigh: 2,
  skyLow: 1.0,
  skyHigh: 0.25,
} as const;

export type WaterTier = 'reflective' | 'cheap';

/** Play-mode spatial upscaler — FSR1 (EASU+RCAS) or bilinear stretch. */
export type UpscalingMethod = 'fsr1' | 'bilinear';

/** Runtime + shipped upscaling tunables (see VISUAL.render.upscaling). */
export interface UpscalingSettings {
  enabled: boolean;
  /** Internal scene-pass scale; 1 = native. FSR skipped when scale is 1. */
  resolutionScale: number;
  method: UpscalingMethod;
  /** RCAS strength — 0 = max sharpen, 2 = none. */
  sharpness: number;
  /** Attenuate RCAS in noisy areas. */
  denoise: boolean;
}

/** WebGPU TSL shadow filter — see configureSunShadowFilter. */
export type SunShadowFilterMode = 'soft' | 'vogel';

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
    shadowFloor: 0.25,
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
    shadowFloor: 0.3,
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
  fogTop: 30,
  /** World Y — band top recedes to this on clear day (before cycle lift at dusk). */
  fogTopDay: 14,
  bandStrength: 1,
  noiseScaleA: 0.01,
  noiseScaleB: 0.015,
  noiseAmplitude: 30,
  /** 0 = static band, 1 = full triNoise3D wisp animation. */
  noiseStrength: 0.35,
  nightColor: '#1a2230',
  dayColor: '#d0dee7',
  /** Sun elevation (°) at/above which fog/haze master ≈ 0 (clear midday). */
  clearElevationDeg: 30,
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
  sky: {
    night: {
      turbidity: 10,
      rayleigh: 3,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.7,
      cloudCoverage: 0,
    },
    day: {
      turbidity: 10,
      rayleigh: 1.5,
      mieCoefficient: 0.004,
      mieDirectionalG: 0.6,
      cloudCoverage: 0.25,
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
    /**
     * Floor on composite blend once the sun clears the terrain silhouette — scaled by the
     * elevation-above-horizon ramp below, so low sun still reads as strongly visible shafts
     * (real occlusion — not this floor — is what keeps rays off while behind a mountain).
     */
    WEIGHT_MIN: 0.5,
    WEIGHT_MAX: 1,
    /**
     * Smoothstep (° above the terrain-silhouette horizon, see `horizonOcclusion` below) for
     * god-ray blend + density — a short, fast ramp right as the sun crosses the horizon.
     */
    ELEV_WEIGHT_START_DEG: 0,
    ELEV_WEIGHT_END_DEG: 2,
    /** Terrain-silhouette sampling toward the sun azimuth — true occlusion, not a fixed elevation guess. */
    horizonOcclusion: {
      /** Ray-march distance (m) — covers the authored map's visible mountain ridges. */
      maxDistanceM: 2000,
      /** Samples per ray along the march. */
      sampleCount: 24,
      /** Rays in the fan around the sun azimuth (robustness against a single narrow gap/peak). */
      rayFanCount: 3,
      /** Fan spread (°) centered on the sun azimuth. */
      rayFanSpreadDeg: 1,
      /** EMA smoothing rate (per second) — avoids frame-to-frame jitter as camera/sun move. */
      smoothRatePerSec: 2,
    },
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
    SUN_INTENSITY_REF: 1.35,
    ELEV_RAY_FALLOFF: 55,
    ELEV_FACTOR_MIN: 0.45,
    ELEV_FACTOR_MAX: 0.95,
  },
  postfx: {
    cohesion: {
      enabled: true,
      /** Bell-curve sharpness: higher = tighter golden-hour peak. */
      goldenHourPower: 1.4,
      /** Scene bloom add multiplier (noon → golden hour). */
      bloomSceneWeight: { atNoon: 0.8, atGoldenHour: 1.12 },
      /**
       * Extra multiplier on god-ray pass weight (after sun intensity) — same golden-hour curve
       * as bloom (peaks at low sun). Real terrain occlusion (`godrays.horizonOcclusion`) already
       * keeps rays off while the sun is behind a mountain, so this boost applies immediately once
       * visible instead of waiting for a further elevation delay.
       */
      godraysWeight: { atNoon: 0.35, atGoldenHour: 1.5 },
      /** During energy reveal only: soften vignette darkness at golden hour (0 = off). */
      vignetteDarknessBleed: 0.12,
    },
    /** Display-referred procedural grade on AgX; creative LUT after renderOutput. */
    grade: {
      enabled: true,
      saturation: 1.0,
      contrast: 1.0,
      lift: { r: 0, g: 0, b: 0 },
      elevation: {
        saturation: { atNoon: 1.0, atGoldenHour: 1.15 },
        contrast: { atNoon: 1.0, atGoldenHour: 1.04 },
        warmth: { atNoon: 0.0, atGoldenHour: 0.15 },
      },
      warmthTint: '#ffb870',
      /**
       * Display creative LUT (Presetpro / Other) — sampled after renderOutput.
       * `.cube` — LUT_3D_SIZE read from file (size hint ignored).
       * `.png` — horizontal strip (width = size², height = size); set `size` (default 32 → 1024×32).
       */
      lut: {
        enabled: true,
        path: '/textures/grade/Other/Presetpro - Elite Chrome.cube',
        size: 32,
        strength: 0.8,
      },
    },
  },
  render: {
    toneMappingExposure: SKY_EXPOSURE_CURVE.groundHigh,
    /**
     * Play-mode resolution scaling + optional FSR1 upscale after FXAA.
     * Only helps when fragment-bound; validate with DEV FPS counter + render-debug toggles.
     */
    upscaling: {
      enabled: true,
      resolutionScale: 0.67,
      method: 'fsr1' as UpscalingMethod,
      sharpness: 0,
      denoise: true,
    } satisfies UpscalingSettings,
  },
  water: {
    /** `reflective` = planar reflector; `cheap` = normal-map only (no extra scene pass). */
    tier: 'reflective' as WaterTier,
    /** Reflector render-target downscale ceiling (see WATER_PARAMS.resolutionScale). */
    resolutionScale: 0.33,
    /**
     * Floor on planar reflection mix — prevents void-black procedural fallback when
     * viewing the surface at grazing angles or with perturbed normals.
     */
    minReflectionMix: 0.22,
    receiveShadow: true,
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
      /** Below this combined importance, RT scale drops to reflectorIdleScale (reflection mix stays at 1). */
      reflectorCutoff: 0.08,
      /** Smallest valid reflector RT scale — must stay > 0 (WebGPU rejects 0×0 targets). */
      reflectorIdleScale: 0.05,
      pitchLowDeg: -5,
      pitchHighDeg: 15,
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
      /**
       * Inset from painted map edge (m) — shore depth blends to open-ocean depth outside.
       * Hides terrain mesh boundary visible through shallow water beyond WORLD.SIZE.
       */
      mapBoundsFadeM: 115,
      /** Synthetic water column depth (m) outside the map — forces opaque deep ocean. */
      openOceanDepthM: 70,
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
    /** Sculpted terrain mesh draws into the sun shadow map (hill → valley shadows). */
    castShadow: true,
    /** Play-mode fine center + coarse macro meshes — macro step = meshSegments / farStepMul. */
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
    /** Which small prop categories cast into the sun shadow map (reload after change). */
    shadowCast: {
      /** Plants, flowers, mushrooms — shared opaque depth pass like tree leaf cards. */
      foliage: true,
      pebbles: true,
    },
    /** Terrain-height contact darkening at prop bases (mapPropShadingTsl). */
    groundContact: {
      enabled: true,
      /** Meters above terrain where contact effect reaches zero. */
      fadeHeightM: 0.65,
      /** Max albedo multiply reduction at ground (0 = none, 0.5 = half brightness at contact). */
      darkenMax: 0.5,
      /** Lerp albedo toward ground tint at contact. */
      tintStrength: 0.5,
      barkStrength: 1.0,
      foliageStrength: 0.3,
      defaultStrength: 0.85,
    },
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
    trailGrowthRate: 0.2,
    trailMinScale: 0,
    trailRadius: 0.8,
    trailKDown: 0.4,
    /** Blade height floor at prop center (scale mul); keeps short stubble instead of bare ground. */
    propGrassMinScale: 0.22,
    playerGlowMul: 0.35,
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
