// src/map/mapGrassSettings.ts — optional per-map grass overrides (map.grass JSON)

import { VISUAL } from '../config/visualTuning.ts';
import type { MapGrassSettings } from './MapTypes.ts';

const MIN_DENSITY = 0;
const MAX_DENSITY = 2;

const DEFAULT_BIOME = VISUAL.grass.biomeDensity;

function clampGrassDensity(value: number | undefined, fallback: number): number {
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
  for (const key of ['meadow', 'forest', 'hills', 'shore', 'mountain', 'path'] as const) {
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
  meadowDensity: number;
  forestDensity: number;
  hillsDensity: number;
  shoreDensity: number;
  mountainDensity: number;
  pathDensity: number;
}

export function mapGrassToUniforms(settings?: MapGrassSettings): MapGrassUniforms {
  const d = settings?.density;
  return {
    meadowDensity: clampGrassDensity(d?.meadow, DEFAULT_BIOME.meadow),
    forestDensity: clampGrassDensity(d?.forest, DEFAULT_BIOME.forest),
    hillsDensity: clampGrassDensity(d?.hills, DEFAULT_BIOME.hills),
    shoreDensity: clampGrassDensity(d?.shore, DEFAULT_BIOME.shore),
    mountainDensity: clampGrassDensity(d?.mountain, DEFAULT_BIOME.mountain),
    pathDensity: clampGrassDensity(d?.path, DEFAULT_BIOME.path),
  };
}
