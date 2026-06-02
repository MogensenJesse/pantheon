// src/map/mapGrassSettings.ts — optional per-map grass overrides (map.grass JSON)

import { VISUAL } from '../config/visualTuning';
import type { MapGrassSettings } from './MapTypes';

const MIN_DENSITY = 0;
const MAX_DENSITY = 2;

export function clampGrassDensity(value: number | undefined, fallback = 1): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, value));
}

/** Validate optional `map.grass` on authored maps. */
export function validateMapGrassSettings(grass: unknown): string | null {
  if (grass === undefined) return null;
  if (!grass || typeof grass !== 'object') return 'grass must be an object';

  const g = grass as Record<string, unknown>;
  if (g.enabled !== undefined && typeof g.enabled !== 'boolean') {
    return 'grass.enabled must be a boolean';
  }

  const density = g.density;
  if (density === undefined) return null;
  if (!density || typeof density !== 'object') return 'grass.density must be an object';

  const d = density as Record<string, unknown>;
  for (const key of ['forest', 'hills', 'shore'] as const) {
    if (d[key] === undefined) continue;
    if (typeof d[key] !== 'number' || !Number.isFinite(d[key] as number)) {
      return `grass.density.${key} must be a number`;
    }
    const v = d[key] as number;
    if (v < MIN_DENSITY || v > MAX_DENSITY) {
      return `grass.density.${key} must be in [${MIN_DENSITY}, ${MAX_DENSITY}]`;
    }
  }
  return null;
}

export function isMapGrassEnabled(settings?: MapGrassSettings): boolean {
  return settings?.enabled !== false;
}

export interface MapGrassUniforms {
  forestDensity: number;
  hillsDensity: number;
  shoreDensity: number;
}

export function mapGrassToUniforms(settings?: MapGrassSettings): MapGrassUniforms {
  const d = settings?.density;
  return {
    forestDensity: clampGrassDensity(d?.forest, 1),
    hillsDensity: clampGrassDensity(d?.hills, 1),
    shoreDensity: clampGrassDensity(d?.shore, 1),
  };
}

export const DEFAULT_MAP_GRASS_UNIFORMS = mapGrassToUniforms();

/** DEV default colors mirror VISUAL.grass. */
export const DEFAULT_GRASS_BASE_COLOR = VISUAL.grass.baseColor;
export const DEFAULT_GRASS_TIP_COLOR = VISUAL.grass.tipColor;
