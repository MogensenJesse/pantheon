// src/world/grass/applyMapGrassSettings.ts — map.grass → GPU uniforms
import { mapGrassToUniforms, type MapGrassUniforms } from '../../map/mapGrassSettings';
import type { MapGrassSettings } from '../../map/MapTypes';
import { grassUniforms } from './grassUniforms';

export function applyMapGrassSettings(settings?: MapGrassSettings): MapGrassUniforms {
  const u = mapGrassToUniforms(settings);
  grassUniforms.uForestDensity.value = u.forestDensity;
  grassUniforms.uHillsDensity.value = u.hillsDensity;
  grassUniforms.uShoreDensity.value = u.shoreDensity;
  return u;
}
