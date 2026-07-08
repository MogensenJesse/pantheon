// src/world/grass/data/propGrassExclusionTexture.ts — R8 mask stamping prop footprints for grass cull
import {
  Box3,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
  Vector3,
} from 'three';
import type { AssetRegistry } from '../../../assets/assetManifest';
import type { MapGrids } from '../../../map/MapGrids';
import type { MapEntity } from '../../../map/MapTypes';
import { PROP_TREE_KEYS } from '../../mapProps/propShadowKeys';
import { WORLD } from '../../WorldConfig';

/** Minimal pad beyond mesh XZ footprint — grass hugs props; tiny buffer avoids tip bleed. */
const EXCLUSION_PAD_M = 0.03;

/** Circumscribed XZ footprint fraction (billboard cards need the full diagonal reach). */
const FOOTPRINT_TIGHTNESS = 0.22;

/** Exclusion map resolution vs height grid — sub-texel props need finer stamps than the 513² grass data map. */
const EXCLUSION_TEXEL_SCALE = 4;

/** Minimum stamp radius in exclusion texels (props smaller than ~½ grass cell still clear a hole). */
const MIN_EXCLUSION_RADIUS_TEXELS = 2;

/** Narrow fade band beyond the prop core — tight hug with a short soft edge. */
const PROP_GRASS_FADE_MUL = 1.12;

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function exclusionTextureSize(gridSize: number): number {
  return gridSize * EXCLUSION_TEXEL_SCALE;
}

export interface PropGrassExclusionCircle {
  x: number;
  z: number;
  radiusM: number;
}

const _box = new Box3();
const _size = new Vector3();
const footprintRadiusCache = new Map<string, number>();

function baseFootprintRadiusM(assets: AssetRegistry, key: string): number {
  const cached = footprintRadiusCache.get(key);
  if (cached !== undefined) return cached;

  const model = assets.get(key);
  let radiusM = 0.32;
  if (model) {
    _box.setFromObject(model);
    _box.getSize(_size);
    const xzHalfExtent = Math.hypot(_size.x, _size.z) * 0.5;
    radiusM = xzHalfExtent * FOOTPRINT_TIGHTNESS;
    radiusM = Math.max(0.12, radiusM);
  }

  footprintRadiusCache.set(key, radiusM);
  return radiusM;
}

export function propGrassExclusionRadiusM(
  assets: AssetRegistry,
  key: string,
  scale: number,
): number {
  return baseFootprintRadiusM(assets, key) * scale + EXCLUSION_PAD_M;
}

export function collectPropGrassExclusions(
  entities: readonly MapEntity[],
  assets: AssetRegistry,
): PropGrassExclusionCircle[] {
  const circles: PropGrassExclusionCircle[] = [];
  for (const entity of entities) {
    if (entity.type !== 'prop') continue;
    if (PROP_TREE_KEYS.has(entity.key)) continue;
    circles.push({
      x: entity.x,
      z: entity.z,
      radiusM: propGrassExclusionRadiusM(assets, entity.key, entity.scale),
    });
  }
  return circles;
}

function stampPropGrassInfluence(
  data: Uint8Array,
  texSize: number,
  worldSize: number,
  x: number,
  z: number,
  coreRadiusM: number,
): void {
  const u = (x / worldSize + 0.5) * texSize;
  const v = (z / worldSize + 0.5) * texSize;
  let coreRTex = (coreRadiusM / worldSize) * texSize;
  coreRTex = Math.max(coreRTex, MIN_EXCLUSION_RADIUS_TEXELS);
  const fadeRTex = coreRTex * PROP_GRASS_FADE_MUL;
  const coreRSq = coreRTex * coreRTex;
  const fadeRSq = fadeRTex * fadeRTex;

  const iMin = Math.max(0, Math.floor(u - fadeRTex));
  const iMax = Math.min(texSize - 1, Math.ceil(u + fadeRTex));
  const jMin = Math.max(0, Math.floor(v - fadeRTex));
  const jMax = Math.min(texSize - 1, Math.ceil(v + fadeRTex));

  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const du = i + 0.5 - u;
      const dv = j + 0.5 - v;
      const distSq = du * du + dv * dv;
      const influence = smoothstep01(coreRSq, fadeRSq, distSq);
      const idx = j * texSize + i;
      const stamped = Math.round(influence * 255);
      data[idx] = Math.min(data[idx]!, stamped);
    }
  }
}

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

export function createPropGrassExclusionTexture(
  grids: MapGrids,
  circles: readonly PropGrassExclusionCircle[],
  worldSize = WORLD.SIZE,
): DataTexture {
  const texSize = exclusionTextureSize(grids.size);
  const data = createExclusionTextureData(texSize);
  for (const circle of circles) {
    stampPropGrassInfluence(data, texSize, worldSize, circle.x, circle.z, circle.radiusM);
  }
  return finalizeExclusionTexture(data, texSize);
}
