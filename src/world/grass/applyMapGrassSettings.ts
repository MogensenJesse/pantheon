// src/world/grass/applyMapGrassSettings.ts — map.grass → GPU uniforms

import type { MapGrassSettings } from '../../map/MapTypes';
import { type MapGrassUniforms, mapGrassToUniforms } from '../../map/mapGrassSettings';
import { grassUniforms } from './grassUniforms';

export function applyMapGrassSettings(settings?: MapGrassSettings): MapGrassUniforms {
  const u = mapGrassToUniforms(settings);
  grassUniforms.uForestDensity.value = u.forestDensity;
  grassUniforms.uHillsDensity.value = u.hillsDensity;
  grassUniforms.uShoreDensity.value = u.shoreDensity;
  return u;
}
