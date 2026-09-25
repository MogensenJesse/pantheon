// src/map/mapCumulusDeck.ts — per-map cumulus deck (map.clouds JSON)
import {
  getCloudGenusProfile,
  updateCloudGenusProfile,
} from '../rendering/clouds/cloudGenusProfiles';
import { readCumulusDeck } from '../rendering/clouds/cumulusDeck';
import type { MapCumulusDeck } from './MapTypes';

const UNIT_KEYS = ['coverage', 'density', 'supercluster', 'deckBaseFraction'] as const;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

const puffAtLoad = getCloudGenusProfile('cumulus');
const deckAtLoad = readCumulusDeck();

/** Frozen at module load, after the genus overlay and before any map apply. */
const SHIPPED_MAP_CUMULUS_DECK: MapCumulusDeck = {
  coverage: deckAtLoad.coverage,
  density: deckAtLoad.density,
  supercluster: deckAtLoad.supercluster,
  deckMinY: deckAtLoad.deckMinY,
  deckMaxY: deckAtLoad.deckMaxY,
  deckYBiasM: deckAtLoad.deckYBiasM,
  spread: deckAtLoad.spread,
  edgeFadeM: deckAtLoad.edgeFadeM,
  windSpeed: deckAtLoad.windSpeed,
  puffLayoutRadiusScale: puffAtLoad.puffLayoutRadiusScale,
  puffLayoutHeightScale: puffAtLoad.puffLayoutHeightScale,
  deckBaseFraction: puffAtLoad.deckBaseFraction,
  particles: puffAtLoad.particlesHint,
};

/** Deck play uses when the map has no `clouds` block. */
export function defaultMapCumulusDeck(): MapCumulusDeck {
  return { ...SHIPPED_MAP_CUMULUS_DECK };
}

export function cloneMapCumulusDeck(deck: MapCumulusDeck): MapCumulusDeck {
  return { ...deck };
}

/** Validate optional `map.clouds`. A missing block is valid. */
export function validateMapCumulusDeck(clouds: unknown): string | null {
  if (clouds === undefined) return null;
  if (!clouds || typeof clouds !== 'object') return 'clouds must be an object';
  const c = clouds as Record<string, unknown>;
  const required = [
    'coverage',
    'density',
    'supercluster',
    'deckMinY',
    'deckMaxY',
    'deckYBiasM',
    'spread',
    'edgeFadeM',
    'windSpeed',
    'puffLayoutRadiusScale',
    'puffLayoutHeightScale',
    'deckBaseFraction',
    'particles',
  ] as const;
  for (const key of required) {
    if (!finite(c[key])) return `clouds.${key} must be a finite number`;
  }
  const deck = c as unknown as MapCumulusDeck;
  for (const key of UNIT_KEYS) {
    if (!inRange(deck[key], 0, 1)) return `clouds.${key} must be in [0, 1]`;
  }
  if (!inRange(deck.deckMinY, 0, 800) || !inRange(deck.deckMaxY, 0, 800)) {
    return 'clouds deck heights must be in [0, 800]';
  }
  if (deck.deckMinY > deck.deckMaxY) return 'clouds.deckMinY must be <= clouds.deckMaxY';
  if (!inRange(deck.deckYBiasM, -40, 80)) return 'clouds.deckYBiasM must be in [-40, 80]';
  if (!inRange(deck.spread, 160, 1600)) return 'clouds.spread must be in [160, 1600]';
  if (deck.edgeFadeM < 0 || deck.edgeFadeM > deck.spread * 0.5) {
    return 'clouds.edgeFadeM must be in [0, half spread]';
  }
  if (!inRange(deck.windSpeed, 0, 100)) return 'clouds.windSpeed must be in [0, 100]';
  if (!inRange(deck.puffLayoutRadiusScale, 0.2, 3)) {
    return 'clouds.puffLayoutRadiusScale must be in [0.2, 3]';
  }
  if (!inRange(deck.puffLayoutHeightScale, 0.1, 3)) {
    return 'clouds.puffLayoutHeightScale must be in [0.1, 3]';
  }
  if (!Number.isInteger(deck.particles) || !inRange(deck.particles, 4, 48)) {
    return 'clouds.particles must be an integer in [4, 48]';
  }
  return null;
}

/**
 * Write the map deck onto the shared cumulus deck and cumulus puff profile.
 * `undefined` restores today's defaults.
 */
export function applyMapCumulusDeck(clouds: MapCumulusDeck | undefined): MapCumulusDeck {
  const next = clouds ? cloneMapCumulusDeck(clouds) : defaultMapCumulusDeck();
  const live = readCumulusDeck();
  live.coverage = next.coverage;
  live.density = next.density;
  live.supercluster = next.supercluster;
  live.deckMinY = next.deckMinY;
  live.deckMaxY = next.deckMaxY;
  live.deckYBiasM = next.deckYBiasM;
  live.spread = next.spread;
  live.edgeFadeM = next.edgeFadeM;
  live.windSpeed = next.windSpeed;
  updateCloudGenusProfile('cumulus', {
    puffLayoutRadiusScale: next.puffLayoutRadiusScale,
    puffLayoutHeightScale: next.puffLayoutHeightScale,
    deckBaseFraction: next.deckBaseFraction,
    particlesHint: next.particles,
  });
  return next;
}
