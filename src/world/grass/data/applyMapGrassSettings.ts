// src/world/grass/data/applyMapGrassSettings.ts — map.grass → CPU density bake inputs

import type { MapGrassSettings } from '../../../map/MapTypes';
import { type MapGrassUniforms, mapGrassToUniforms } from '../../../map/mapGrassSettings';

export function applyMapGrassSettings(settings?: MapGrassSettings): MapGrassUniforms {
  return mapGrassToUniforms(settings);
}
