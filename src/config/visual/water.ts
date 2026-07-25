// src/config/visual/water.ts — ocean mesh, shore depth, tide

import type { WaterReflectClouds, WaterTier } from './types';

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
  } as const;
