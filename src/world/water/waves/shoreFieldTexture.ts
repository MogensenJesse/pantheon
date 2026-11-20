// src/world/water/waves/shoreFieldTexture.ts — the baked shore field as a float RGBA data texture (see shoreFieldBake.ts)
import { DataTexture, FloatType, RGBAFormat } from 'three';
import { WORLD } from '../../../config/world';
import { applyDataTextureDefaults } from '../../../map/dataTexture';
import type { MapGrids } from '../../../map/MapGrids';
import { bakeShoreField, SHORE_FIELD_SIZE, type ShoreField } from './shoreFieldBake';

function bake(grids: MapGrids, waterLevelM: number, reuse?: ShoreField): ShoreField {
  return bakeShoreField(
    {
      heights: grids.height,
      gridSize: grids.size,
      heightScale: WORLD.HEIGHT_SCALE,
      waterLevelM,
      worldSize: WORLD.SIZE,
    },
    reuse,
  );
}

function textureOver(field: ShoreField): DataTexture {
  const tex = new DataTexture(field.data, field.size, field.size, RGBAFormat, FloatType);
  applyDataTextureDefaults(tex);
  tex.needsUpdate = true;
  return tex;
}

/** 1 x 1 stand-in (far from every shore, heading +x) bound until a map is built; the swell is zero there anyway. */
export function createShoreFieldPlaceholder(): DataTexture {
  return textureOver({ size: 1, cellM: WORLD.SIZE, data: new Float32Array([1e4, -1, 0, 0]) });
}

export function createShoreFieldTexture(grids: MapGrids, waterLevelM: number): DataTexture {
  return textureOver(bake(grids, waterLevelM));
}

/** Re-bakes in place (the water level moved in the editor). */
export function updateShoreFieldTexture(
  tex: DataTexture,
  grids: MapGrids,
  waterLevelM: number,
): void {
  const data = tex.image.data as Float32Array;
  if (data.length !== SHORE_FIELD_SIZE * SHORE_FIELD_SIZE * 4) return;
  bake(grids, waterLevelM, { size: SHORE_FIELD_SIZE, cellM: 0, data });
  tex.needsUpdate = true;
}
