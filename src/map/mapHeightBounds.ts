// src/map/mapHeightBounds.ts — signed normalized height (worldY / HEIGHT_SCALE)
import { WORLD } from '../config/world.ts';
import type { MapHeightMode } from './MapTypes.ts';

export type { MapHeightMode };

/** Lowest sculpt/import height as a fraction of HEIGHT_SCALE (~−87.5 m). */
export const HEIGHT_NORM_MIN = -0.25;

/** Highest sculpt/import height as a fraction of HEIGHT_SCALE. */
export const HEIGHT_NORM_MAX = 1;

export function isRawSignedHeightMode(mode: MapHeightMode | undefined): boolean {
  return mode === 'rawSigned';
}

export function sanitizeHeightNorm(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function clampHeightNorm(value: number): number {
  return Math.max(HEIGHT_NORM_MIN, Math.min(HEIGHT_NORM_MAX, sanitizeHeightNorm(value)));
}

export function heightNormFromMetres(metres: number): number {
  return metres / WORLD.HEIGHT_SCALE;
}

export function heightMetresFromNorm(norm: number): number {
  return norm * WORLD.HEIGHT_SCALE;
}

export function resolveMapHeightMode(mode: MapHeightMode | undefined): MapHeightMode {
  return mode === 'rawSigned' ? 'rawSigned' : 'shaped';
}
