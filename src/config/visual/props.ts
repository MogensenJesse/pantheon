// src/config/visual/props.ts — map prop shadows, foliage lighting, ground contact

import { FOLIAGE_LIGHTING } from './foliage.ts';
import { SHADOW_RECEIVERS } from './shadows.ts';

export const props = {
  ...SHADOW_RECEIVERS.props,
  foliageLighting: FOLIAGE_LIGHTING,
  /** Alpha cutoff for MASK foliage — rejects soft fringe with black RGB bleed (GLTF default 0.2). */
  alphaTest: 0.45,
  /** smoothstep width above alphaTest for hardened opacityNode. */
  alphaCutoffSharpness: 0.05,
  /** Which small prop categories cast into the sun shadow map (reload after change). */
  shadowCast: {
    /** Plants, flowers, mushrooms — shared opaque depth pass like tree leaf cards. */
    foliage: false,
    pebbles: false,
  },
  /** Intentional burial below sampled terrain surface (metres) — props sit slightly sunken. */
  surfaceSinkM: 0.1,
  /**
   * Distance-banded mesh LOD for map props (lod0/1/2 GLBs from bake:play-props).
   * Beyond farMaxM instances are culled. Tunable live in DEV (Shadows → Prop LOD).
   */
  lod: {
    enabled: true,
    /** lod0 (full mesh): 0 .. nearMaxM */
    nearMaxM: 80,
    /** lod1 (mid): nearMaxM .. midMaxM */
    midMaxM: 150,
    /** lod2 (far): midMaxM .. farMaxM; beyond → culled */
    farMaxM: 300,
    /** Only rebin when player moves farther than this from last rebin origin. */
    rebinThresholdM: 4,
    /**
     * Sticky band margin (m): leave a LOD only after crossing its cut by this much.
     * Stops near↔mid↔far thrash (and shadow silhouette pops) when walking band edges.
     */
    hysteresisM: 8,
    /** Highest LOD that casts sun shadows (0 = near only, 1 = near+mid, 2 = all). */
    shadowCastMaxLod: 2,
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
    /**
     * Baked terrain-side contact AO under prop bases (mesh XZ silhouette with height cutoff).
     * Shares the grass exclusion texel scale (~0.39 m). Shape knobs are live in DEV (rebake).
     */
    terrainAo: {
      enabled: true,
      /** Soft tail past the outer silhouette (m) — extends where the core→edge fade reaches 0%. */
      radiusM: 1.2,
      /** Max ambient darkening under a prop (0 = none, 1 = black). */
      strength: 0.85,
      /**
       * Outer stamp height — geometry above this over the instance base is ignored.
       * Raise to include canopy for a wide AO extent; fade still anchors on coreHeightM.
       */
      baseHeightM: 4,
      /**
       * Full-strength core height (trunk/base silhouette). AO is 100% on this shape and
       * fades shape-wise to 0% at the outer baseHeightM silhouette edge.
       */
      coreHeightM: 1.2,
      /** Extra darkening on the direct sun term so bases stay grounded at noon. */
      sunStrength: 0.5,
    },
  },
} as const;
