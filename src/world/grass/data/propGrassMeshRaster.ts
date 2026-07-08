// src/world/grass/data/propGrassMeshRaster.ts — XZ mesh silhouette stamp for grass prop exclusion
import { Matrix4, type Mesh, type Object3D, Vector3 } from 'three';
import type { AssetRegistry } from '../../../assets/assetManifest';
import { VISUAL } from '../../../config/visualTuning';
import type { MapEntity } from '../../../map/MapTypes';
import type { MapTerrainContext } from '../../MapTerrainBuilder';
import type { MapPropPlacement } from '../../mapProps/mapPropPlacement';
import { propAlignsToTerrainSlope } from '../../mapProps/mapPropTerrainAlign';
import {
  computeModelFootLocal,
  resolvePropInstanceMatrix,
} from '../../mapProps/resolvePropInstanceMatrix';
import {
  createPropTerrainSurface,
  type PropTerrainSurface,
} from '../../terrain/cpu/terrainSurfaceCpu';

export const EXCLUSION_TEXEL_SCALE = 4;

const _matrix = new Matrix4();
const _footLocal = new Vector3();
const _va = new Vector3();
const _vb = new Vector3();
const _vc = new Vector3();

const CHAMFER_INF = 65535;

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function worldToTexel(
  x: number,
  z: number,
  texSize: number,
  worldSize: number,
): { u: number; v: number } {
  return {
    u: (x / worldSize + 0.5) * texSize,
    v: (z / worldSize + 0.5) * texSize,
  };
}

function extractMeshes(modelScene: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  modelScene.traverse((c) => {
    const m = c as Mesh;
    if (m.isMesh) meshes.push(m);
  });
  return meshes;
}

function entityToPlacement(e: Extract<MapEntity, { type: 'prop' }>): MapPropPlacement {
  return {
    x: e.x,
    z: e.z,
    yRotation: e.rotY,
    scale: e.scale,
    surfaceLift: e.surfaceLift ?? 0,
  };
}

function rasterizeTriangle(
  inside: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(width - 1, Math.ceil(Math.max(y0, y1, y2)));

  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-8) return;

  for (let j = minY; j <= maxY; j++) {
    for (let i = minX; i <= maxX; i++) {
      const px = i + 0.5;
      const py = j + 0.5;
      const w0 = ((x1 - x2) * (py - y2) - (y1 - y2) * (px - x2)) / area;
      const w1 = ((x2 - x0) * (py - y0) - (y2 - y0) * (px - x0)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
        inside[j * width + i] = 1;
      }
    }
  }
}

/** Chamfer distance from inside pixels (0 on footprint, increasing outward). */
function chamferDistanceFromInside(inside: Uint8Array, width: number, height: number): Uint16Array {
  const dist = new Uint16Array(width * height);
  for (let i = 0; i < dist.length; i++) {
    dist[i] = inside[i]! ? 0 : CHAMFER_INF;
  }

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const idx = j * width + i;
      let d = dist[idx]!;
      if (i > 0) d = Math.min(d, dist[idx - 1]! + 3);
      if (j > 0) d = Math.min(d, dist[idx - width]! + 3);
      if (i > 0 && j > 0) d = Math.min(d, dist[idx - width - 1]! + 4);
      if (i < width - 1 && j > 0) d = Math.min(d, dist[idx - width + 1]! + 4);
      dist[idx] = d;
    }
  }

  for (let j = height - 1; j >= 0; j--) {
    for (let i = width - 1; i >= 0; i--) {
      const idx = j * width + i;
      let d = dist[idx]!;
      if (i < width - 1) d = Math.min(d, dist[idx + 1]! + 3);
      if (j < height - 1) d = Math.min(d, dist[idx + width]! + 3);
      if (i < width - 1 && j < height - 1) d = Math.min(d, dist[idx + width + 1]! + 4);
      if (i > 0 && j < height - 1) d = Math.min(d, dist[idx + width - 1]! + 4);
      dist[idx] = d;
    }
  }

  return dist;
}

function influenceFromInsideMask(
  inside: Uint8Array,
  width: number,
  height: number,
  padTexels: number,
  edgeFadeTexels: number,
): Uint8Array {
  const dist = chamferDistanceFromInside(inside, width, height);
  const out = new Uint8Array(width * height);
  const fadeDenom = Math.max(edgeFadeTexels, 1);

  for (let i = 0; i < out.length; i++) {
    const dTex = dist[i]! / 3;
    if (dTex <= padTexels) {
      out[i] = 0;
    } else if (dTex >= padTexels + edgeFadeTexels) {
      out[i] = 255;
    } else {
      const t = (dTex - padTexels) / fadeDenom;
      out[i] = Math.round(smoothstep01(t) * 255);
    }
  }
  return out;
}

function blitInfluenceMin(
  global: Uint8Array,
  texSize: number,
  local: Uint8Array,
  originI: number,
  originJ: number,
  localW: number,
  localH: number,
): void {
  for (let j = 0; j < localH; j++) {
    const gj = originJ + j;
    if (gj < 0 || gj >= texSize) continue;
    for (let i = 0; i < localW; i++) {
      const gi = originI + i;
      if (gi < 0 || gi >= texSize) continue;
      const src = local[j * localW + i]!;
      const dst = gj * texSize + gi;
      global[dst] = Math.min(global[dst]!, src);
    }
  }
}

/** Stamp one prop instance mesh silhouette into the global R8 influence buffer. */
export function stampPropMeshFootprint(
  data: Uint8Array,
  texSize: number,
  worldSize: number,
  entity: Extract<MapEntity, { type: 'prop' }>,
  assets: AssetRegistry,
  surface: PropTerrainSurface,
): void {
  const model = assets.get(entity.key);
  if (!model) return;

  const placement = entityToPlacement(entity);
  const alignToSlope = propAlignsToTerrainSlope(entity.key);
  const footLocal = computeModelFootLocal(model, _footLocal);
  resolvePropInstanceMatrix(placement, surface, alignToSlope, footLocal, _matrix);

  const texelSizeM = worldSize / texSize;
  const padTexels = Math.ceil(VISUAL.grass.propGrassPadM / texelSizeM);
  const edgeFadeTexels = Math.max(1, Math.ceil(VISUAL.grass.propGrassEdgeFadeM / texelSizeM));
  const margin = padTexels + edgeFadeTexels + 2;

  let minU = texSize;
  let minV = texSize;
  let maxU = 0;
  let maxV = 0;

  const triangleVerts: number[] = [];

  for (const mesh of extractMeshes(model)) {
    const pos = mesh.geometry.attributes.position;
    if (!pos) continue;
    const index = mesh.geometry.index;

    const projectVertex = (vi: number, target: Vector3): void => {
      target.fromBufferAttribute(pos, vi);
      target.applyMatrix4(_matrix);
      const { u, v } = worldToTexel(target.x, target.z, texSize, worldSize);
      minU = Math.min(minU, u);
      minV = Math.min(minV, v);
      maxU = Math.max(maxU, u);
      maxV = Math.max(maxV, v);
      triangleVerts.push(u, v);
    };

    if (index) {
      for (let t = 0; t < index.count; t += 3) {
        projectVertex(index.getX(t), _va);
        projectVertex(index.getX(t + 1), _vb);
        projectVertex(index.getX(t + 2), _vc);
      }
    } else {
      for (let vi = 0; vi < pos.count; vi += 3) {
        projectVertex(vi, _va);
        projectVertex(vi + 1, _vb);
        projectVertex(vi + 2, _vc);
      }
    }
  }

  if (triangleVerts.length === 0 || minU > maxU) return;

  const originI = Math.max(0, Math.floor(minU) - margin);
  const originJ = Math.max(0, Math.floor(minV) - margin);
  const endI = Math.min(texSize - 1, Math.ceil(maxU) + margin);
  const endJ = Math.min(texSize - 1, Math.ceil(maxV) + margin);
  const localW = endI - originI + 1;
  const localH = endJ - originJ + 1;

  const inside = new Uint8Array(localW * localH);

  for (let t = 0; t < triangleVerts.length; t += 6) {
    rasterizeTriangle(
      inside,
      localW,
      triangleVerts[t]! - originI,
      triangleVerts[t + 1]! - originJ,
      triangleVerts[t + 2]! - originI,
      triangleVerts[t + 3]! - originJ,
      triangleVerts[t + 4]! - originI,
      triangleVerts[t + 5]! - originJ,
    );
  }

  const localInfluence = influenceFromInsideMask(inside, localW, localH, padTexels, edgeFadeTexels);
  blitInfluenceMin(data, texSize, localInfluence, originI, originJ, localW, localH);
}

export function createPropGrassSurface(terrain: MapTerrainContext): PropTerrainSurface {
  return createPropTerrainSurface(terrain);
}

export function exclusionTextureSize(gridSize: number): number {
  return gridSize * EXCLUSION_TEXEL_SCALE;
}
