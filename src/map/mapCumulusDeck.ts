// src/map/mapCumulusDeck.ts — per-map cumulus deck (map.clouds JSON)

import { readCumulusDeck } from '../rendering/clouds/cumulusDeck.ts';
import {
  CUMULUS_DECK_SLIDERS,
  type CumulusDeckSliderKey,
  clampCumulusDeckSlider,
} from '../rendering/clouds/cumulusDeckSliders.ts';
import type { MapCumulusDeck } from './MapTypes.ts';

const DECK_KEYS = CUMULUS_DECK_SLIDERS.map((spec) => spec.key).filter(
  (key): key is Exclude<CumulusDeckSliderKey, 'sunPhase'> => key !== 'sunPhase',
);

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const deckAtLoad = readCumulusDeck();

/** Frozen at module load, before any map apply. */
const SHIPPED_MAP_CUMULUS_DECK: MapCumulusDeck = {
  coverage: deckAtLoad.coverage,
  bankScaleM: deckAtLoad.bankScaleM,
  bankSoftness: deckAtLoad.bankSoftness,
  density: deckAtLoad.density,
  supercluster: deckAtLoad.supercluster,
  deckMinY: deckAtLoad.deckMinY,
  deckMaxY: deckAtLoad.deckMaxY,
  deckYBiasM: deckAtLoad.deckYBiasM,
  spread: deckAtLoad.spread,
  edgeFadeM: deckAtLoad.edgeFadeM,
  windSpeed: deckAtLoad.windSpeed,
};

/** Deck play uses when the map has no `clouds` block. */
export function defaultMapCumulusDeck(): MapCumulusDeck {
  return { ...SHIPPED_MAP_CUMULUS_DECK };
}

export function cloneMapCumulusDeck(deck: MapCumulusDeck): MapCumulusDeck {
  return { ...deck };
}

/**
 * Copy the field keys and drop puff keys from older maps.
 * Call only after `validateMapCumulusDeck` succeeds.
 */
export function normalizeMapCumulusDeck(clouds: unknown): MapCumulusDeck {
  const c = clouds as Record<string, unknown>;
  const next = {} as MapCumulusDeck;
  for (const key of DECK_KEYS) next[key] = c[key] as number;
  return next;
}

/** Validate optional `map.clouds`. A missing block is valid. Puff keys are ignored. */
export function validateMapCumulusDeck(clouds: unknown): string | null {
  if (clouds === undefined) return null;
  if (!clouds || typeof clouds !== 'object') return 'clouds must be an object';
  const c = clouds as Record<string, unknown>;
  for (const key of DECK_KEYS) {
    if (!finite(c[key])) return `clouds.${key} must be a finite number`;
    const value = c[key];
    const spec = CUMULUS_DECK_SLIDERS.find((entry) => entry.key === key);
    if (!spec || value < spec.min || value > spec.max) {
      return `clouds.${key} must be in [${spec?.min}, ${spec?.max}]`;
    }
  }
  const deck = c as unknown as MapCumulusDeck;
  if (deck.deckMinY > deck.deckMaxY) return 'clouds.deckMinY must be <= clouds.deckMaxY';
  if (deck.edgeFadeM > deck.spread * 0.5) {
    return 'clouds.edgeFadeM must be in [0, half spread]';
  }
  return null;
}

/**
 * Write the map deck onto the shared cumulus deck.
 * `undefined` restores today's defaults. Puff keys are not applied.
 */
export function applyMapCumulusDeck(clouds: MapCumulusDeck | undefined): MapCumulusDeck {
  const next = clouds ? cloneMapCumulusDeck(clouds) : defaultMapCumulusDeck();
  const live = readCumulusDeck();
  live.coverage = clampCumulusDeckSlider('coverage', next.coverage);
  live.bankScaleM = clampCumulusDeckSlider('bankScaleM', next.bankScaleM);
  live.bankSoftness = clampCumulusDeckSlider('bankSoftness', next.bankSoftness);
  live.density = clampCumulusDeckSlider('density', next.density);
  live.supercluster = clampCumulusDeckSlider('supercluster', next.supercluster);
  live.deckMinY = clampCumulusDeckSlider('deckMinY', next.deckMinY);
  live.deckMaxY = clampCumulusDeckSlider('deckMaxY', next.deckMaxY);
  live.deckYBiasM = clampCumulusDeckSlider('deckYBiasM', next.deckYBiasM);
  live.spread = clampCumulusDeckSlider('spread', next.spread);
  live.edgeFadeM = Math.min(clampCumulusDeckSlider('edgeFadeM', next.edgeFadeM), live.spread * 0.5);
  live.windSpeed = clampCumulusDeckSlider('windSpeed', next.windSpeed);
  return {
    coverage: live.coverage,
    bankScaleM: live.bankScaleM,
    bankSoftness: live.bankSoftness,
    density: live.density,
    supercluster: live.supercluster,
    deckMinY: live.deckMinY,
    deckMaxY: live.deckMaxY,
    deckYBiasM: live.deckYBiasM,
    spread: live.spread,
    edgeFadeM: live.edgeFadeM,
    windSpeed: live.windSpeed,
  };
}
