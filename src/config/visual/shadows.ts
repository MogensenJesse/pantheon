// src/config/visual/shadows.ts — sun shadow map + per-receiver receive floors
//
// Cascades:
//   Far:  ±280 m @ mapSize — still baked (godrays / clouds); NOT used on ground receivers
//         while near.enabled (DEV "Far map resolution" was the glitchy overlay).
//   Near: ±32 m @ mapSize — ground receive when enabled (stable close shadows).
//   Receivers: near (+ min cloud), or far if near off.
//   A/B near at 4096 via lighting.near.mapSize — full reload.
//
// Freeze sample counts / blocker map during polish (do not churn unless needed):
//   pcssBlockerSamples, pcssFilterSamples, pcssBlockerMapSize.

const SHADOW_LIGHTING = {
  /**
   * Far / main directional shadow map resolution (square).
   * Density = (2 * FAR_FOLLOW_HALF) / mapSize ≈ 0.137 m/texel at 4096.
   * Near cascade owns prop-scale density — do not keep raising this alone.
   */
  mapSize: 4096,
  /**
   * PCSS contact-hardening — penumbra texels when caster is near the receiver.
   * (PcssShadowFilter on color-depth RT via PcssShadowNode)
   */
  shadowSoftnessMin: 1,
  /**
   * Max penumbra texels for elevated non-cloud casters (tall trees).
   * Cloud-cast umbras use VISUAL.clouds.castShadowSoftness on a separate map.
   * Kept moderate — large softMax amplifies residual penumbra flicker.
   */
  shadowSoftnessMax: 24,
  /**
   * Depth-gap → texel radius gain. Higher = softens faster with caster height.
   * Tuned so ground contact stays near min, mid/tall trees approach softMax.
   */
  shadowPenumbraScale: 480,
  /**
   * Shadow-map depth bias (NDC). Three applies `coordZ + bias` (non-reversed).
   * Negative → peter-panning (lit contact); positive → acne. Prefer 0 + contactPushM.
   */
  shadowBias: 0.00025,
  /**
   * World-space sample lift along the receiver normal (m). Keep low — high values
   * open lit rings under props even when depth bias is neutral.
   */
  shadowNormalBias: 0.05,
  /**
   * Terrain/grass receive: push the shadow sample away from the sun (m) so contact
   * stays in umbra when casters sit in detail displacement / sink. Closes the lit
   * gap under rocks without a large normalBias.
   */
  shadowContactPushM: 0.06,
  /**
   * Twist-stable light-view texel snap of the follow pose (stabilizeLightViewShadow).
   * Applied on follow / light-distance moves (and full refresh) only — not on sun-angle-only
   * frames, where snapping in a rotating basis thrashs the penumbra.
   */
  stabilizeShadowMap: true,
  /**
   * When true (and useSoftShadowMap is false), use color-depth PCSS via PcssShadowNode
   * on the cascade that owns soft detail (near when enabled, else the main/far map).
   * When false, fall back to compare-only WidePCF. Toggle needs a full page reload.
   * WidePCF is the cheap baseline (~16 compare taps) for quantifying PCSS cost.
   */
  usePcss: true,
  /**
   * PCSS Vogel blocker-search tap count (plus 1 center). Compile-time — reload after change.
   * Soft-path fetches ≈ 1 + blockerSamples + filterSamples (compare taps = free 2×2 PCF).
   */
  pcssBlockerSamples: 12,
  /**
   * PCSS soft-umbra Vogel tap count (hardware compare / 2×2 PCF). Keep dense relative to
   * softMax or large penumbrae band. Compile-time — reload.
   */
  pcssFilterSamples: 20,
  /**
   * Blocker-search disk radius in shadow-map texels (independent of softMax).
   * Compile-time — reload after change.
   */
  pcssBlockerSearchTexels: 40,
  /**
   * Vogel disk rotation seed for PCSS (blocker + filter). Compile-time — reload.
   * - `screenHp` — drei SoftShadows high-pass from screen pixels; stable under sun UV drift
   *   (soft edges look like fixed grain). Grain crawls when the camera looks around.
   * - `world` — quantized world XZ (`pcssVogelGridM`); stable under camera look / walk.
   * - `fixed` — phi = 0 (banded rings; stability A/B).
   */
  pcssVogelSeed: 'fixed',
  /**
   * World-XZ cell size (m) when `pcssVogelSeed` is `world`. Unused for screenHp/fixed.
   * Compile-time — reload.
   */
  pcssVogelGridM: 0.25,
  /**
   * Downsampled R32F blocker-map resolution for PCSS gap search (min/max-reduced from
   * the full shadow depth). Bilinear-filtered so radius varies smoothly under UV drift.
   * Capped at shadow mapSize. Compile-time — reload after change.
   */
  pcssBlockerMapSize: 1024,
  /**
   * Legacy flag — WebGPU always uses radius-aware PCF (configureSunShadowFilter).
   * PCFSoftShadowMap ignores shadow.radius on TSL receivers. Disables PCSS when true.
   */
  useSoftShadowMap: false,
  /**
   * PCSS filter radius source. Compile-time — reload.
   * - `contact` — blocker gap → penumbra (normal PCSS; can shimmer under sun UV drift)
   * - `softMin` — always softness min (skip blocker search; radius-thrash A/B)
   * - `fixed` — always `pcssFixedRadiusTexels`
   * - `softMax` — always softness max (skip blocker search)
   */
  pcssRadiusMode: 'contact',
  /**
   * Constant filter radius in texels when `pcssRadiusMode` is `fixed`.
   * Compile-time — reload.
   */
  pcssFixedRadiusTexels: 8,
  /**
   * Dense player-follow cascade (separate intensity-0 light). When enabled, ground
   * receivers use this map only (+ cloud) — not far. Toggle / mapSize need a full page reload.
   */
  near: {
    enabled: true,
    /** Ortho half-extent (m). Span 64 m @ 2048 ≈ 3.1 cm/texel. */
    halfExtentM: 32,
    /**
     * Square map resolution for the soft PCSS cascade.
     * When enabled, the main/far sun map switches to hard coverage (not PCSS).
     * Try 4096 for denser close-up A/B (~1.56 cm/texel). Full reload.
     */
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
    /**
     * Linear remap of PCSS visibility before floor/strength. Defaults [0,1] = identity —
     * PCSS already softens edges; a tight band (e.g. 0.1–0.9) amplifies residual shimmer.
     */
    shadowSmoothMin: 0,
    shadowSmoothMax: 1,
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
