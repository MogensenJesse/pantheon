// src/config/visual/shadows.ts — sun shadow map + per-receiver receive floors

const SHADOW_LIGHTING = {
  /** Directional shadow map resolution (square — width and height). */
  mapSize: 8192,
  /**
   * PCSS contact-hardening — penumbra texels when caster is near the receiver.
   * (PcssShadowFilter on color-depth RT via PcssShadowNode)
   */
  shadowSoftnessMin: 1,
  /**
   * Max penumbra texels for elevated non-cloud casters (tall trees).
   * Cloud-cast umbras use VISUAL.clouds.castShadowSoftness on a separate map.
   */
  shadowSoftnessMax: 48,
  /**
   * Depth-gap → texel radius gain. Higher = softens faster with caster height.
   * Tuned so ground contact stays near min, mid/tall trees approach softMax.
   */
  shadowPenumbraScale: 540,
  /**
   * Shadow-map depth bias (NDC). Three applies `coordZ + bias` (non-reversed).
   * Negative → peter-panning (lit contact); positive → acne. Prefer 0 + contactPushM.
   */
  shadowBias: 0,
  /**
   * World-space sample lift along the receiver normal (m). Keep low — high values
   * open lit rings under props even when depth bias is neutral.
   */
  shadowNormalBias: 0.01,
  /**
   * Terrain/grass receive: push the shadow sample away from the sun (m) so contact
   * stays in umbra when casters sit in detail displacement / sink. Closes the lit
   * gap under rocks without a large normalBias.
   */
  shadowContactPushM: 0.06,
  /**
   * Snap follow target to world-XZ shadow texels — stops walk swimming without the
   * edge shiver that light-view snap causes when the sun rotates continuously.
   */
  stabilizeShadowMap: true,
  /**
   * When true (and useSoftShadowMap is false), use color-depth PCSS via PcssShadowNode.
   * When false, fall back to compare-only WidePCF. Toggle needs a full page reload.
   * WidePCF is the cheap baseline (~16 compare taps) for quantifying PCSS cost.
   */
  usePcss: true,
  /**
   * PCSS Vogel blocker-search tap count (plus 1 center). Compile-time — reload after change.
   * Soft-path fetches ≈ 1 + blockerSamples + filterSamples (point); contact adds ×4 bilinear.
   */
  pcssBlockerSamples: 10,
  /**
   * PCSS soft-umbra Vogel tap count (point samples). Contact path uses a fixed smaller
   * bilinear count. Keep dense relative to softMax or large penumbrae band. Compile-time — reload.
   */
  pcssFilterSamples: 16,
  /**
   * Blocker-search disk radius in shadow-map texels (independent of softMax).
   * Compile-time — reload after change.
   */
  pcssBlockerSearchTexels: 40,
  /**
   * Legacy flag — WebGPU always uses radius-aware PCF (configureSunShadowFilter).
   * PCFSoftShadowMap ignores shadow.radius on TSL receivers. Disables PCSS when true.
   */
  useSoftShadowMap: false,
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
    /** PCF edge softening — wider band reduces shimmer on alpha-cutout foliage. */
    shadowSmoothMin: 0.1,
    shadowSmoothMax: 0.9,
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
