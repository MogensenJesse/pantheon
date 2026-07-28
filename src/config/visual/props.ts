// src/config/visual/props.ts — map prop shadows, foliage lighting, ground contact

import { FOLIAGE_LIGHTING } from './foliage';
import { SHADOW_RECEIVERS } from './shadows';

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
    /** Highest LOD that casts sun shadows (0 = near only, 1 = near+mid). Far never casts. */
    shadowCastMaxLod: 1,
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
} as const;
