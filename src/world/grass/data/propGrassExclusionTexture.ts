// src/world/grass/data/propGrassExclusionTexture.ts — R8 mesh-footprint mask for grass prop exclusion
import type { DataTexture } from 'three';
import type { AssetRegistry } from '../../../assets/assetManifest';
import { createFilledR8Texture, createR8Texture } from '../../../map/dataTexture';
import type { MapEntity } from '../../../map/MapTypes';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { PROP_TREE_KEYS } from '../../mapProps/config/propShadowKeys';
import { WORLD } from '../../WorldConfig';
import {
  createPropGrassSurface,
  exclusionTextureSize,
  stampPropMeshFootprint,
} from './propGrassMeshRaster';

/** Default 255 = full grass; stamps lower influence near props (min blend). */
export function createEmptyPropGrassExclusionTexture(gridSize: number): DataTexture {
  return createFilledR8Texture(exclusionTextureSize(gridSize), 255);
}

function bakePropGrassExclusionFromEntities(
  data: Uint8Array,
  texSize: number,
  worldSize: number,
  terrain: MapTerrainContext,
  entities: readonly MapEntity[],
  assets: AssetRegistry,
): void {
  const surface = createPropGrassSurface(terrain);
  for (const entity of entities) {
    if (entity.type !== 'prop') continue;
    if (PROP_TREE_KEYS.has(entity.key)) continue;
    stampPropMeshFootprint(data, texSize, worldSize, entity, assets, surface);
  }
}

export function createPropGrassExclusionTexture(
  terrain: MapTerrainContext,
  entities: readonly MapEntity[],
  assets: AssetRegistry,
  worldSize = WORLD.SIZE,
): DataTexture {
  const texSize = exclusionTextureSize(terrain.grids.size);
  const data = new Uint8Array(texSize * texSize).fill(255);
  bakePropGrassExclusionFromEntities(data, texSize, worldSize, terrain, entities, assets);
  return createR8Texture(data, texSize);
}
