// src/config/visual/water.ts — ocean mesh, shore depth, waves

import type { WaterReflectClouds, WaterReflectProps, WaterTier } from './types.ts';

export const water = {
  tier: 'reflective' as WaterTier,
  /** `proxy` = one sphere/cluster; `full` = main-pass mesh; `off` = sky+terrain. */
  reflectClouds: 'proxy' as WaterReflectClouds,
  reflectCloudProxyScale: 0.9,
  reflectProps: 'large' as WaterReflectProps,
  resolutionScale: 0.33,
  /** Floor on reflection mix — avoids void-black at grazing angles. */
  minReflectionMix: 0.22,
  /**
   * Mirror plane offset (m) relative to the surface; the swell's current height, the swash peak and `waves.mesh.edgeLiftM`
   * add in the same direction, and the plane never rises above the camera's eye (a low camera would lose the reflection).
   * Negative lifts the plane toward shore (2× image shift closes the low-res seam).
   */
  reflectionPlaneOffsetM: -0.05,
  receiveShadow: true,
  size: 4,
  alpha: 1,
  /** Look stops sampled via todWeights. */
  stops: {
    night: {
      waterColor: '#050a14',
      sunColor: '#2a3344',
      distortion: 8,
      shallowColor: '#0d3d35',
    },
    goldenHour: {
      waterColor: '#34507A',
      sunColor: '#FFB070',
      distortion: 5,
      shallowColor: '#2A5A58',
    },
    noon: {
      waterColor: '#3A8ED0',
      sunColor: '#FFF0D0',
      distortion: 5,
      shallowColor: '#3AD8C8',
    },
  },
  edgeFadeStartRatio: 0.92,
  edgeFadeEndRatio: 1.0,
  adaptive: {
    minScale: 0.15,
    inlandFloor: 0,
    shoreDistanceStart: 25,
    shoreDistanceEnd: 80,
    coastProbeDirs: 12,
    coastProbeStepM: 32,
    coastMaxSearchM: 192,
    pitchLowDeg: -5,
    pitchHighDeg: 15,
    viewWaterNearM: 60,
    viewWaterFarM: 320,
    dampLambda: 6,
  },
  shoreDepth: {
    enabled: true,
    absorption: 0.35,
    /** Width of the water's soft edge at the waterline (horizontal m). Small on purpose: the water, its caustics, the foam and the wet sand all start on the same line; a wide fade leaves clear water the eye reads as dry sand. */
    coastFadeM: 0.5,
    shallowDepthM: 13,
    refractionDepthM: 8,
    /** Translucent multiply of shallowColor over refracted seabed (1 = full tint, sand still shows). */
    shallowOverRefract: 0.7,
    shadowOpacityBoost: 0.6,
    refractionStrength: 1,
    refractionOffset: 5,
    refractionOpacity: 1,
    fogBypassStrength: 0.9,
    /** Fade to open-ocean depth outside map edge. */
    mapBoundsFadeM: 115,
    openOceanDepthM: 70,
  },
  /** Waves: open-sea swells (vertex) and shore waves (foam fronts + swash on the sand). Maths in `world/water/waves/waveMath.ts`. */
  waves: {
    swell: {
      enabled: true,
      /** Total swell height (m, all components added) in calm weather and in a full storm. */
      calmHeightM: 1.1,
      stormHeightM: 2,
      /** Wind boost (`windUniforms.uWindBoost`, 1 = calm) at which the swell is at full storm strength. */
      fullEnergyBoost: 2.2,
      /** Share of the real deep-water wave speed (gravity waves) the pattern moves at. The swell always travels toward the nearest shore (see waves/shoreFieldBake.ts). */
      speedScale: 0.7,
      /** Horizontal Gerstner shift as a share of the height: sharper crests, flatter troughs (0 = plain sines). */
      steepness: 0.8,
      /**
       * The swell dies out as the water gets shallower than this (m), handing over to the shore waves. It never gets
       * shorter than 2.5 x the swell's current height (waveMath `effectiveShoalDepthM`): that keeps the troughs above
       * the sea floor, so the swell never moves the waterline (only the swash does).
       */
      shoalDepthM: 1,
      /**
       * The swell grows with the distance to the nearest shore: 1 x near land (within `fromM`, the waves are as they were), up
       * to `gain` x from `toM` on, so the open sea is taller than the coast. The shoaling depth grows with it (the waterline
       * rule holds), the mirror plane's headroom does not (there is no terrain out there to meet).
       */
      openSea: { gain: 4, fromM: 30, toM: 450 },
      /** Each component: wavelength (m) and share of the total height. */
      components: [
        { wavelengthM: 56, share: 0.4 },
        { wavelengthM: 33, share: 0.3 },
        { wavelengthM: 19, share: 0.2 },
        { wavelengthM: 11, share: 0.1 },
      ],
      /** A component fades out between these distances (in its own wavelengths) from the camera: the mesh is too coarse for it beyond. */
      fadeFromWavelengths: 1,
      fadeToWavelengths: 14,
      /** Foam on crests: from this share of the crest height (0..1) up, once the energy is above `energyFrom`. */
      whitecap: { crestFrom: 0.65, crestTo: 1, energyFrom: 0.15, amount: 0.85 },
    },
    shore: {
      enabled: true,
      foamColor: '#ffffff',
      /** Seconds between fronts (two fronts run at once, half a cycle apart). */
      periodS: 7,
      /** Metres of water (measured to the waterline) where a front is born, and how far its foam trails behind it. */
      breakDistM: 14,
      trailM: 4,
      /** Width (m) of the thin foam fringe that hugs the waterline between fronts. */
      fringeM: 0.45,
      /** Metres of the noise that bends the fronts along the beach, and the share of a cycle it shifts them by. */
      alongShoreM: 60,
      wobble: 0.35,
      /** Foam strength in calm weather (1 in a storm); `stormMul` widens the breaker zone and the swash in a storm. */
      calmShare: 0.8,
      stormMul: 1.6,
      /**
       * The swash: the water's edge itself moves. When a front arrives, the sea at the shore rises `swashHeightM` (m above the
       * mean level, so the edge climbs `swashHeightM / beach slope` metres up the sand: further on a flat beach) in
       * `riseShare` of a cycle (the uprush), then falls back over `backwashShare` of it to `recedeShare` x `swashHeightM`
       * below the mean level (the edge retreats down the beach before the next front).
       */
      swashHeightM: 1,
      riseShare: 0.3,
      backwashShare: 0.6,
      recedeShare: 0.1,
      /** Swash lobes: the edge bulges and pulls back in patches `lobeM` m long, by up to `lobeShare` of the swash. */
      lobeM: 30,
      lobeShare: 0.5,
      /** How high (m above the mean level) the sand always stays damp, and the share of a cycle the sand takes to dry after a swash. */
      dampHeightM: 0.5,
      dryShare: 0.75,
      wetSandDarken: 0.5,
      /**
       * Moist sand: sand near the water is always a little wet, even where no wave reaches. A lighter band (`moistDarken`)
       * that fades out `moistWidthM` m (horizontal, from the waterline) inland, but never climbs higher than `moistHeightM`
       * m above the mean level (so steep ground gets a thin band, and the shader work stays near the shore).
       */
      moistWidthM: 25,
      moistHeightM: 7.5,
      moistDarken: 0.4,
      shoreSlopeStepM: 4,
      shoreMaxSlope: 6,
    },
    /**
     * Enclosed water (lakes, ponds: water below the sea level that the sea cannot reach, found by a flood fill from the map
     * border; see waves/shoreFieldBake.ts). Each number is its share of the open-sea value: 1 = no difference, 0 = none. Live.
     */
    lake: {
      /** Swell height. The whitecaps follow it, so a calm lake never breaks. */
      swellShare: 0.12,
      /** Swash height and reach, and the wet sand it makes. */
      swashShare: 0.3,
      /** Foam fronts and the fringe on the waterline. */
      foamShare: 0.2,
      /** Fine ripples (the normal map): a calmer surface also mirrors the sky more clearly. */
      rippleShare: 0.5,
    },
    /** The water mesh: a disc of rings that follows the camera, finest near it. Reload to apply. */
    mesh: {
      /** Radius (m) of the filled centre and the angular segments. */
      innerM: 3,
      segments: 192,
      /** Each ring is this much wider than the last, out to `fineToM`; beyond that `coarseGrowth` to the rim. */
      ringGrowth: 0.04,
      fineToM: 1500,
      coarseGrowth: 0.5,
      /** Live: how far (m) the geometry rides above the exact surface over the shallows, so the waterline is the shader's edge and not the grid's jagged cut through the terrain (it wobbles when the camera moves). */
      edgeLiftM: 0.02,
    },
  },
} as const;
