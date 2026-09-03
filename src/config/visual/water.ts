// src/config/visual/water.ts — ocean mesh, shore depth, tide

import type { WaterReflectClouds, WaterReflectProps, WaterTier } from './types.ts';

export const water = {
  /** `reflective` = planar reflector; `cheap` = normal-map only (no extra scene pass). */
  tier: 'reflective' as WaterTier,
  /**
   * Mesh clouds in the planar reflector.
   * `proxy` = one low-poly sphere per cluster (keeps sky blobs, ~particlesPerCloud× cheaper).
   * `full` = same soft-particle mesh as the main pass.
   * `off` = sky + terrain only.
   */
  reflectClouds: 'proxy' as WaterReflectClouds,
  /** Inflates each cluster proxy to cover the soft-particle footprint. */
  reflectCloudProxyScale: 0.9,
  /**
   * Map props in the planar reflector. Props draw again in the reflection pass, so
   * `large` (trees + rocks) keeps the visible silhouettes at a fraction of `all`.
   */
  reflectProps: 'large' as WaterReflectProps,
  /** Reflector render-target downscale ceiling (see WATER_PARAMS.resolutionScale). */
  resolutionScale: 0.33,
  /**
   * Floor on planar reflection mix — prevents void-black procedural fallback when
   * viewing the surface at grazing angles or with perturbed normals.
   */
  minReflectionMix: 0.22,
  /**
   * Signed offset (m) of the planar reflector's mirror plane relative to the water surface.
   * Negative lifts the plane, positive drops it; live tide amplitude is added in the
   * same direction so the surface can never cross the plane as the tide bobs.
   *
   * Lifting shifts the reflected image toward the shoreline (the mirror shift is 2x the
   * offset), which closes the low-res seam where reflected terrain meets sky. Dropping it
   * pushes the reflection away from shore and widens that seam instead.
   */
  reflectionPlaneOffsetM: -0.05,
  receiveShadow: true,
  size: 4,
  alpha: 1,
  distortionDay: 3.7,
  distortionNight: 8,
  /** Deep-water albedo + sun glint (lerped by daylight in syncPantheonWater). */
  day: {
    waterColor: '#06283a',
    sunColor: '#fff3df',
  },
  night: {
    waterColor: '#050a14',
    sunColor: '#2a3344',
  },
  /** Radial opacity falloff — full inside start×radius, transparent at end×radius. */
  edgeFadeStartRatio: 0.72,
  edgeFadeEndRatio: 1.0,
  adaptive: {
    /** Smallest reflector RT scale — must stay > 0 (WebGPU rejects 0×0 targets). */
    minScale: 0.15,
    /** Minimum importance weight inland (0 = reflector can drop to minScale). */
    inlandFloor: 0,
    shoreDistanceStart: 25,
    shoreDistanceEnd: 80,
    /** Radial probe for nearest submerged terrain (replaces map-edge heuristic). */
    coastProbeDirs: 12,
    coastProbeStepM: 32,
    coastMaxSearchM: 192,
    pitchLowDeg: -5,
    pitchHighDeg: 15,
    /** Full reflector scale when the nearest water ahead of the camera is within this range (m). */
    viewWaterNearM: 60,
    /** Reflector scale ramps down to minScale once the nearest water ahead is past this range (m). */
    viewWaterFarM: 320,
    dampLambda: 6,
  },
  /** Terrain-height shore clip + Beer-Lambert depth opacity + shallow teal tint (waterDepthTsl). */
  shoreDepth: {
    enabled: true,
    /** Beer-Lambert absorption k — higher = opaque sooner with depth. */
    absorption: 0.6,
    /** Smooth coast fade (horizontal m) when terrain rises above the waterline. */
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
  /** Gentle tidal bob + seaward waterline lace on the water surface. */
  tide: {
    enabled: true,
    waveSpeed: 0.7,
    /** Meters — whole water disc oscillates on Y. */
    waveAmplitude: 0.25,
    foamColor: '#ffffff',
    /** Seaward lace width (m) on the water surface. */
    foamWidthM: 0.5,
    /** World-XZ scallop offset of the waterline (m). */
    foamRippleAmplitude: 0.2,
    /** Scallop spatial frequency (higher = tighter tongues). */
    foamRippleScale: 0.1,
    /** Scallop animation speed. */
    foamRippleSpeed: 0.4,
    /** Slow world-XZ patch field — thick opaque foam vs thin translucent (0 = uniform). */
    foamPatchVariation: 1,
    /** Patch spatial scale (lower = larger foam blobs along the shore). */
    foamPatchScale: 0.35,
    /** Stripe opacity at thin patch troughs (thick patches → 1). */
    foamOpacityMin: 0.6,
    /** Wash/core width multiplier at thin patch troughs (thick patches → 1). */
    foamWidthMinRatio: 0.65,
    /** Height-map gradient sample spacing (m) for shore distance. */
    shoreSlopeStepM: 4,
    /** Cliff rail on |grad h| — keeps a minimum ribbon riding up rock. */
    shoreMaxSlope: 6,
    /** Detail-displacement fade width (m) around the mean waterline. */
    coastFlattenM: 6,
    /** Slow traveling run-up offset of the waterline (m). */
    runUpM: 0.1,
    /** Run-up cycle length (s). */
    runUpPeriodSec: 7,
    /** Landward wet-sand darken amount (0–1). */
    wetSandDarken: 0.4,
    /** Landward wet-sand ramp width at low tide (m). */
    wetSandMinM: 2,
    /** Landward wet-sand ramp width at peak recession (m). */
    wetSandM: 6,
    /** Radians — delays wet-band peak until after high tide (π/2 ≈ max while receding). */
    wetSandPhaseLagRad: Math.PI / 2,
  },
} as const;
