// src/world/grass/grassHeightTexture.ts — GPU height sample for grass Y placement
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
} from 'three';
import type { MapGrids } from '../../map/MapGrids';

/** Normalized height [0,1] per map cell (matches terrain heightNorm). */
export function createGrassHeightTexture(grids: MapGrids): DataTexture {
  const { size } = grids;
  const data = new Uint8Array(size * size);
  for (let i = 0; i < grids.height.length; i++) {
    const h = Math.max(0, Math.min(1, grids.height[i]));
    data[i] = Math.round(h * 255);
  }
  const tex = new DataTexture(data, size, size, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function updateGrassHeightTexture(tex: DataTexture, grids: MapGrids): void {
  const data = tex.image.data as Uint8Array;
  for (let i = 0; i < grids.height.length; i++) {
    const h = Math.max(0, Math.min(1, grids.height[i]));
    data[i] = Math.round(h * 255);
  }
  tex.needsUpdate = true;
}
