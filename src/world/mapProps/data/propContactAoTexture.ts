// src/world/mapProps/data/propContactAoTexture.ts — R8 height-limited prop base footprints for terrain contact AO
import type { DataTexture } from 'three';
import type { AssetRegistry } from '../../../assets/assetManifest';
import { createFilledR8Texture } from '../../../map/dataTexture';
import type { MapEntity } from '../../../map/MapTypes';
import {
  createPropGrassSurface,
  exclusionTextureSize,
  stampPropMeshFootprint,
} from '../../grass/data/propGrassMeshRaster';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { WORLD } from '../../WorldConfig';
import { getLiveTerrainAoBakeSettings } from './propContactAoDevState';

/** Default 255 = open ground; stamps lower influence under prop bases (min blend). */
export function createEmptyPropContactAoTexture(gridSize: number): DataTexture {
  return createFilledR8Texture(exclusionTextureSize(gridSize), 255);
}

/**
 * Fill an existing prop-AO texture in place (same DataTexture identity the terrain material
 * already binds). Includes trees via height-limited trunk footprints.
 */
export function bakePropContactAoIntoTexture(
  tex: DataTexture,
  terrain: MapTerrainContext,
  entities: readonly MapEntity[],
  assets: AssetRegistry,
  worldSize = WORLD.SIZE,
): void {
  const ao = getLiveTerrainAoBakeSettings();
  if (!ao.enabled) {
    (tex.image.data as Uint8Array).fill(255);
    tex.needsUpdate = true;
    return;
  }

  const texSize = tex.image.width;
  const data = tex.image.data as Uint8Array;
  data.fill(255);

  const surface = createPropGrassSurface(terrain);
  const stampOpts = {
    padM: 0,
    edgeFadeM: ao.radiusM,
    maxHeightAboveBaseM: ao.baseHeightM,
    coreHeightAboveBaseM: ao.coreHeightM,
  };

  for (const entity of entities) {
    if (entity.type !== 'prop') continue;
    stampPropMeshFootprint(data, texSize, worldSize, entity, assets, surface, stampOpts);
  }

  tex.needsUpdate = true;
}
