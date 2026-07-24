// src/world/grass/data/propGrassExclusionTexture.ts — R8 mesh-footprint mask for grass prop exclusion
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
} from 'three';
import type { AssetRegistry } from '../../../assets/assetManifest';
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
function createExclusionTextureData(texSize: number): Uint8Array {
  return new Uint8Array(texSize * texSize).fill(255);
}

function finalizeExclusionTexture(data: Uint8Array, texSize: number): DataTexture {
  const tex = new DataTexture(data, texSize, texSize, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createEmptyPropGrassExclusionTexture(gridSize: number): DataTexture {
  const texSize = exclusionTextureSize(gridSize);
  return finalizeExclusionTexture(createExclusionTextureData(texSize), texSize);
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
  const data = createExclusionTextureData(texSize);
  bakePropGrassExclusionFromEntities(data, texSize, worldSize, terrain, entities, assets);
  return finalizeExclusionTexture(data, texSize);
}
