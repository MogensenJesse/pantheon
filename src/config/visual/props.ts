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
    /**
     * Screen-space hashed alpha for tree leaves/needles — dithers cutout edges to reduce
     * temporal shimmer. 0 = hardened cutout only; 1 = full hashed threshold.
     */
    hashedAlphaStrength: 1,
    /** Which small prop categories cast into the sun shadow map (reload after change). */
    shadowCast: {
      /** Plants, flowers, mushrooms — shared opaque depth pass like tree leaf cards. */
      foliage: false,
      pebbles: false,
    },
    /** Intentional burial below sampled terrain surface (metres) — props sit slightly sunken. */
    surfaceSinkM: 0.1,
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
