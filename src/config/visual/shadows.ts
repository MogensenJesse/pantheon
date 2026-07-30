// src/config/visual/shadows.ts — near PCSS ground shadows + hard main map for godrays/clouds
//
// Architecture:
//   Near: ±halfExtentM @ near.mapSize — ground receive (terrain/grass/props/water), PCSS.
//   Main: ±280 m @ mapSize — godrays depth + cloud mesh receive only (hard coverage filter).
//   Cloud-cast: separate soft map, min'd into ground receivers.
//
// Freeze sample counts / blocker map during polish:
//   pcssBlockerSamples, pcssFilterSamples, pcssBlockerMapSize.

const SHADOW_LIGHTING = {
  /**
   * Main / far directional shadow map resolution (square).
   * Used for godrays occlusion + cloud mesh receive — not ground umbras.
   * Density ≈ (2 * 280) / mapSize m/texel.
   */
  mapSize: 4096,
  /**
   * PCSS contact-hardening — penumbra texels when caster is near the receiver.
   * (PcssShadowFilter on the near cascade via PcssShadowNode)
   */
  shadowSoftnessMin: 1,
  /**
   * Max penumbra texels for elevated non-cloud casters (tall trees).
   * Cloud-cast umbras use VISUAL.clouds.castShadowSoftness on a separate map.
   */
  shadowSoftnessMax: 24,
  /**
   * Depth-gap → texel radius gain. Higher = softens faster with caster height.
   */
  shadowPenumbraScale: 480,
  /**
   * Shadow-map depth bias (NDC). Three applies `coordZ + bias` (non-reversed).
   * Prefer 0 + contactPushM when possible.
   */
  shadowBias: 0.00025,
  /**
   * World-space sample lift along the receiver normal (m).
   */
  shadowNormalBias: 0.05,
  /**
   * Terrain/grass receive: push the shadow sample away from the sun (m).
   */
  shadowContactPushM: 0.06,
  /**
   * PCSS Vogel blocker-search tap count (plus 1 center). Compile-time — reload after change.
   */
  pcssBlockerSamples: 12,
  /**
   * PCSS soft-umbra Vogel tap count (hardware compare / 2×2 PCF). Compile-time — reload.
   */
  pcssFilterSamples: 20,
  /**
   * Blocker-search disk radius in shadow-map texels (independent of softMax).
   * Compile-time — reload after change.
   */
  pcssBlockerSearchTexels: 40,
  /**
   * Downsampled R32F blocker-map resolution for PCSS gap search.
   * Capped at near mapSize. Compile-time — reload after change.
   */
  pcssBlockerMapSize: 1024,
  /**
   * Dense player-follow cascade — ground receive (PCSS). mapSize / halfExtent need a full reload
   * unless resized live via the DEV near-map control.
   */
  near: {
    /** Ortho half-extent (m). Span 64 m @ 4096 ≈ 1.56 cm/texel. */
    halfExtentM: 32,
    /** Square map resolution for the soft PCSS cascade. */
    mapSize: 4096,
  },
} as const;

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
    /** Foliage-only normal-aligned shadow sample lift; opaque props use positionWorld. */
    shadowSampleLiftM: 0.12,
    nightColorFloor: 0.06,
    playerGlowMul: 0.35,
  },
  water: {
    /** Min lit fraction in full tree shadow on water (0 = black, 1 = no darkening). */
    shadowFloor: 0.3,
  },
} as const;

export const shadows = {
  lighting: SHADOW_LIGHTING,
  receivers: SHADOW_RECEIVERS,
} as const;

export { SHADOW_LIGHTING, SHADOW_RECEIVERS };
