// src/rendering/clouds/cumulusDeck.ts — one cumulus deck for the designer and play
// Designer sliders write this object. Play reads it when the field is built.
// Not part of genus Save JSON.

export interface CumulusDeckConfig {
  /** 0–1 coverage mask. */
  coverage: number;
  /** 0–1 requested count on this spread. */
  density: number;
  /**
   * 0–1 pick bias inside the mask. 0 is even weight and 1× size.
   * 1 uses the wide yellow band and 0.5×–6× size.
   */
  supercluster: number;
  deckMinY: number;
  deckMaxY: number;
  /** Meters added once to the shared base. Not multiplied by height scale. */
  deckYBiasM: number;
  spread: number;
  edgeFadeM: number;
  windSpeed: number;
  /** Fringe size at supercluster 1. Supercluster 0 stays 1×. */
  greenSize: number;
  /** Core size at supercluster 1. */
  redSize: number;
  /** Placement seed. Designer and play share it. */
  seed: number;
}

const DECK_MIN_SPACING_M = 40;

export function cumulusDeckMaxCloudCount(spread: number): number {
  return Math.max(1, Math.floor((spread / DECK_MIN_SPACING_M) ** 2));
}

export function cumulusCloudCountForDensity(density: number, spread: number): number {
  const d = Math.max(0, Math.min(1, density));
  if (d <= 0) return 0;
  const max = cumulusDeckMaxCloudCount(spread);
  return Math.max(1, Math.min(max, Math.round(d * max)));
}

const SPREAD_M = 480;

/** Shipped deck. The designer mutates this; play reads the same object. */
export const cumulusDeck: CumulusDeckConfig = {
  coverage: 0.78,
  density: 28 / cumulusDeckMaxCloudCount(SPREAD_M),
  supercluster: 0,
  deckMinY: 40,
  deckMaxY: 90,
  deckYBiasM: 0,
  spread: SPREAD_M,
  edgeFadeM: SPREAD_M * 0.5 * 0.12,
  windSpeed: 16,
  greenSize: 0.5,
  redSize: 6,
  seed: 42,
};

export function readCumulusDeck(): CumulusDeckConfig {
  return cumulusDeck;
}
