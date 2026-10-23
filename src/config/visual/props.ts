// src/config/visual/props.ts — map prop shadows, foliage, ground contact

import { FOLIAGE_LIGHTING } from './foliage.ts';
import { SHADOW_RECEIVERS } from './shadows.ts';

export const props = {
  ...SHADOW_RECEIVERS.props,
  foliageLighting: FOLIAGE_LIGHTING,
  alphaTest: 0.45,
  alphaCutoffSharpness: 0.05,
  surfaceSinkM: 0.1,
  /**
   * Beat the grass depth bias in the vertex stage (keeps early-Z). false restores the old per-fragment
   * `depthNode` write. Full reload after change; kept as a switch so the fps difference can be compared.
   * Village buildings always use the per-fragment write: the vertex pull skews faces that are metres wide.
   */
  vertexDepthBias: true,
  /**
   * Trees in the wind. The crown leans along the wind in a gust wave that travels with it, the trunk stays stiff
   * (the lean is weighted by height), and near trees flutter. The wind itself is shared with the grass and the
   * clouds (`rendering/ambience`); this is only how far a tree gives to it. Live in the DEV panel ("Tree sway").
   */
  sway: {
    /** Crown lean in steady wind, as a share of the model's height (a scaled-down copy still leans by the model's height). */
    baseLean: 0.012,
    /** Extra crown lean at the strongest part of a gust (same unit). */
    gustLean: 0.03,
    /** Share of the gust lean that wobbles across the wind instead of along it. */
    sideShare: 0.35,
    /** A model shorter than this (m) does not sway. */
    minHeightM: 0.5,
    /** Share of the gust that is the slow, broad wave (the rest is a faster, narrower one). */
    gustSlowShare: 0.65,
    /** How stiff the lower tree is: the lean is weighted by (height share) ^ power. */
    heightPower: 2.2,
    /** The gust wave travels along the wind: its wavelength (m) and period (s). */
    waveLengthM: 90,
    periodS: 7,
    /** Leaf flutter at the crown top (m) and its rate (Hz): near trees only (lod0). */
    flutterM: 0.05,
    flutterHz: 1.4,
    /** Flutter rises near the orb: the radius (m) and the extra share gained at its centre. */
    orbRadiusM: 7,
    orbGain: 2.5,
    /** How much each species gives, by asset key prefix: lean and flutter factors. */
    species: [
      { prefix: 'birch_', bend: 1, flutter: 1 },
      { prefix: 'pine_', bend: 0.9, flutter: 0.6 },
      { prefix: 'fir_', bend: 0.8, flutter: 0.45 },
    ],
  },
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
