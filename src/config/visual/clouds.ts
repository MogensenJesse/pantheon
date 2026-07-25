// src/config/visual/clouds.ts — procedural mesh-cluster clouds

const CLOUDS = {
  enabled: true,
  preset: 'partlyCloudy' as const,
  /** Seeded field layout — full reload after change. */
  seed: 12345,
  cloudCount: 50,
  particlesPerCloud: 32,
  /** World Y — above terrain peaks (~240 m at HEIGHT_SCALE 128). */
  cloudBaseY: 40,
  altitudeJitter: 50,
  /**
   * Horizontal domain width (m) centered on origin — wind wraps inside this box.
   * Slightly larger than WORLD.SIZE so the sky reads past the map rim.
   */
  spread: 1000,
  /** Soft-fade band at the wrap edges (m) — opacity → 0 so wrap isn't a hard pop. */
  edgeFadeM: 140,
  opacity: 0.5,
  /**
   * View-facing alpha power — higher = softer / more faded rims (soft-particle falloff).
   * Combined with edgeSoftness + radialSoftness for blob dissolve.
   */
  facingPow: 2.4,
  /** N·V smoothstep width — larger = wider soft rim before full opacity. */
  edgeSoftness: 0.7,
  /**
   * Extra soft-particle power (adds to facingPow). Safe on spheres — unlike length(pos),
   * which is always ~1 on sphere verts and used to wipe the whole puff.
   */
  radialSoftness: 0.3,
  /** How strongly triNoise3D erodes the silhouette into wisps (0–1). */
  wispStrength: 1,
  /** World-space noise scales — high enough to vary within a ~20 m puff. */
  wispScaleA: 0.1,
  wispScaleB: 0.12,
  /** triNoise3D animation rate. */
  wispSpeed: 0.18,
  /** Flatten wrap/SSS lighting so overlapping spheres stop reading as lit discs. */
  lightFlatten: 0.32,
  windSpeed: 16,
  /** Matches sky.cycle.azimuthEast convention (degrees). */
  windDirectionDeg: 270,
  /** Energy/atmosphere reveal ramp on opacity (pre-sun → full day). Night keeps full opacity. */
  revealMinCoverage: 0.25,
  revealMaxCoverage: 1,
  /**
   * Cast opaque sphere silhouettes into a **dedicated soft shadow map** (not the PCSS sun map).
   * Ground receivers + god rays sample that map at {@link castShadowSoftness}. Cloud-cast
   * refreshes every 2nd frame when only particles drifted.
   */
  castShadows: true,
  /** Soft cloud-cast penumbra radius in shadow-map texels (WidePCF Vogel, compare sampler). */
  castShadowSoftness: 64,
  /** Dedicated cloud-cast map resolution (square). Soft umbras hide lower res than the sun map. */
  castShadowMapSize: 2048,
  /** Receive sun shadows from terrain / props (mountain umbra on cloud lit face). */
  receiveShadows: true,
  /** Min lit fraction of the sun term when fully in shadow (ambient stays). */
  shadowFloor: 0.35,
  /** World-Y lift for shadow map samples — reduces soft-sphere self-shadow acne. */
  shadowSampleLiftM: 6,
  /** Valley-haze mix on clouds (0 = exempt, 1 = full fogArea). */
  hazeMix: 0.5,
  /** Floor for world light scale so night/dawn clouds stay readable. */
  lightScaleMin: 0.08,
  /** How strongly the warm golden palette applies at low sun (0–1). */
  goldenTintStrength: 0.7,
  /**
   * Dawn/dusk sun catch — lifts directional sun on the lit face so clouds aren’t dark blotches
   * while ambient (shadowed side) still tracks world intensity.
   */
  sunCatchStrength: 0.85,
  /** Lift instances over macro terrain + soft-fade residual intersection. */
  terrainInteractionEnabled: true,
  /** World Y clearance above macro height when lifting / fading. */
  terrainClearanceM: 12,
  /** Soft-fade depth below terrain surface (m) before alpha hits 0. */
  terrainFadeBelowM: 8,
} as const;

export const clouds = CLOUDS;
