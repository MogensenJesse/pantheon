// src/world/mapProps/data/propContactAoTexture.ts — R8 height-limited prop base footprints for terrain contact AO
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
} from 'three';
import type { AssetRegistry } from '../../../assets/assetManifest';
import { VISUAL } from '../../../config/visualTuning';
import type { MapEntity } from '../../../map/MapTypes';
import {
  createPropGrassSurface,
  exclusionTextureSize,
  stampPropMeshFootprint,
} from '../../grass/data/propGrassMeshRaster';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import { WORLD } from '../../WorldConfig';

/** Default 255 = open ground; stamps lower influence under prop bases (min blend). */
function createAoTextureData(texSize: number): Uint8Array {
  return new Uint8Array(texSize * texSize).fill(255);
}

function finalizeAoTexture(data: Uint8Array, texSize: number): DataTexture {
  const tex = new DataTexture(data, texSize, texSize, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createEmptyPropContactAoTexture(gridSize: number): DataTexture {
  const texSize = exclusionTextureSize(gridSize);
  return finalizeAoTexture(createAoTextureData(texSize), texSize);
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
  const ao = VISUAL.props.groundContact.terrainAo;
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
  };

  for (const entity of entities) {
    if (entity.type !== 'prop') continue;
    stampPropMeshFootprint(data, texSize, worldSize, entity, assets, surface, stampOpts);
  }

  tex.needsUpdate = true;
}

export function createPropContactAoTexture(
  terrain: MapTerrainContext,
  entities: readonly MapEntity[],
  assets: AssetRegistry,
  worldSize = WORLD.SIZE,
): DataTexture {
  const tex = createEmptyPropContactAoTexture(terrain.grids.size);
  bakePropContactAoIntoTexture(tex, terrain, entities, assets, worldSize);
  return tex;
}
