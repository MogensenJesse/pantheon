// src/world/grass/applyMapGrassSettings.ts — map.grass → GPU uniforms

import type { MapGrassSettings } from '../../../map/MapTypes';
import { type MapGrassUniforms, mapGrassToUniforms } from '../../../map/mapGrassSettings';
import { grassSharedUniforms } from '../config/grassUniforms';

export function applyMapGrassSettings(settings?: MapGrassSettings): MapGrassUniforms {
  const u = mapGrassToUniforms(settings);
  grassSharedUniforms.uMeadowDensity.value = u.meadowDensity;
  grassSharedUniforms.uForestDensity.value = u.forestDensity;
  grassSharedUniforms.uHillsDensity.value = u.hillsDensity;
  grassSharedUniforms.uShoreDensity.value = u.shoreDensity;
  grassSharedUniforms.uMountainDensity.value = u.mountainDensity;
  grassSharedUniforms.uPathDensity.value = u.pathDensity;
  return u;
}
