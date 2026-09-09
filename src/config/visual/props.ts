// src/config/visual/props.ts — map prop shadows, foliage, ground contact

import { FOLIAGE_LIGHTING } from './foliage.ts';
import { SHADOW_RECEIVERS } from './shadows.ts';

export const props = {
  ...SHADOW_RECEIVERS.props,
  foliageLighting: FOLIAGE_LIGHTING,
  alphaTest: 0.45,
  alphaCutoffSharpness: 0.05,
  shadowCast: {
    foliage: false,
    pebbles: false,
  },
  surfaceSinkM: 0.1,
  lod: {
    enabled: true,
    nearMaxM: 80,
    midMaxM: 150,
    farMaxM: 1000,
    rebinThresholdM: 4,
    /** Margin before leaving a band — stops LOD thrash at edges. */
    hysteresisM: 8,
    shadowCastMaxLod: 2,
  },
  groundContact: {
    enabled: true,
    fadeHeightM: 0.65,
    darkenMax: 0.5,
    tintStrength: 0.5,
    barkStrength: 1.0,
    foliageStrength: 0.3,
    defaultStrength: 0.85,
    /** Baked terrain AO under prop bases; shape knobs rebake in DEV. */
    terrainAo: {
      enabled: true,
      radiusM: 1.2,
      strength: 0.85,
      /** Geometry above this over instance base is ignored. */
      baseHeightM: 4,
      coreHeightM: 1.2,
      /** Sun-term darkening; min with PCSS (no double under tree umbra). */
      sunStrength: 0.5,
    },
  },
} as const;
