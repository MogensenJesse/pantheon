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

/** CSS-style easeOutQuad — gentler than expo, less mid-gray plateau than smoothstep. */
function easeOutQuad01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) * (1 - x);
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

/**
 * XZ raster with optional world-Y clip. Interpolated height must be <= maxWorldY.
 * Avoids trunk-touching canopy triangles flooding the whole silhouette at full strength.
 */
function rasterizeTriangleHeightCulled(
  inside: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  h0: number,
  x1: number,
  y1: number,
  h1: number,
  x2: number,
  y2: number,
  h2: number,
  maxWorldY: number,
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
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      if (w0 * h0 + w1 * h1 + w2 * h2 > maxWorldY) continue;
      inside[j * width + i] = 1;
    }
  }
}

/** Two-pass 3-4 chamfer into `dist` (seeded by caller: 0 / CHAMFER_INF). */
function runChamferPasses(dist: Uint16Array, width: number, height: number): void {
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
}

/** Chamfer distance from inside pixels (0 on footprint, increasing outward). */
function chamferDistanceFromInside(inside: Uint8Array, width: number, height: number): Uint16Array {
  const dist = new Uint16Array(width * height);
  for (let i = 0; i < dist.length; i++) {
    dist[i] = inside[i]! ? 0 : CHAMFER_INF;
  }
  runChamferPasses(dist, width, height);
  return dist;
}

/** Depth inside the mask (0 outside / on exterior, increasing toward the medial axis). */
function chamferDistanceInsideDepth(
  inside: Uint8Array,
  width: number,
  height: number,
): Uint16Array {
  const dist = new Uint16Array(width * height);
  for (let i = 0; i < dist.length; i++) {
    dist[i] = inside[i]! ? CHAMFER_INF : 0;
  }
  runChamferPasses(dist, width, height);
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

/**
 * Full AO on `core`, fading shape-wise to open ground at the soft outer boundary:
 * the outer mesh silhouette plus `pad` / `edgeFade` (radiusM). Outside that → open.
 * Caller must ensure `core` is non-empty (mesh and/or foot disc seed).
 */
function influenceFromCoreToOuter(
  outer: Uint8Array,
  core: Uint8Array,
  width: number,
  height: number,
  padTexels: number,
  edgeFadeTexels: number,
): Uint8Array {
  // Soft outer = mesh silhouette dilated by pad + radius. Fade completes at this boundary
  // (no re-darkening ring — exterior is a continuation of the interior falloff).
  const distFromOuter = chamferDistanceFromInside(outer, width, height);
  const softOuter = new Uint8Array(width * height);
  const softRadius = padTexels + edgeFadeTexels;
  for (let i = 0; i < softOuter.length; i++) {
    softOuter[i] = outer[i] || distFromOuter[i]! / 3 <= softRadius ? 1 : 0;
  }

  const distFromCore = chamferDistanceFromInside(core, width, height);
  const depthInSoft = chamferDistanceInsideDepth(softOuter, width, height);
  const out = new Uint8Array(width * height);

  for (let i = 0; i < out.length; i++) {
    if (!softOuter[i]) {
      out[i] = 255;
      continue;
    }
    if (core[i]) {
      out[i] = 0;
      continue;
    }

    const dCore = distFromCore[i]! / 3;
    const dIn = depthInSoft[i]! / 3;
    const denom = dCore + dIn;
    if (denom < 1e-3) {
      out[i] = 0;
    } else {
      // 0 at core, 1 at soft-outer edge — easeOutQuad for a moderate soft falloff.
      out[i] = Math.round(easeOutQuad01(dCore / denom) * 255);
    }
  }
  return out;
}

/** Seed a filled disc into a local mask (texel space, float center). */
function stampDiscMask(
  mask: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radiusTexels: number,
): void {
  const r = Math.max(radiusTexels, 0.55);
  const r2 = r * r;
  const i0 = Math.max(0, Math.floor(cx - r - 1));
  const i1 = Math.min(width - 1, Math.ceil(cx + r + 1));
  const j0 = Math.max(0, Math.floor(cy - r - 1));
  const j1 = Math.min(height - 1, Math.ceil(cy + r + 1));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      const dy = j + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) mask[j * width + i] = 1;
    }
  }
}

/** Minimum core disc so low coreHeight never leaves an empty core (which used to hard-fill the outer). */
const MIN_CORE_DISC_M = 0.45;

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

/** Stamp options — pad/fade in world metres; optional height cutoff for trunk-only footprints. */
export interface StampPropMeshFootprintOptions {
  padM: number;
  edgeFadeM: number;
  /**
   * When set, only stamp texels whose interpolated world Y is <= baseY + this.
   * Yields trunk footprints for trees (canopy ignored) and full shape for low props.
   */
  maxHeightAboveBaseM?: number;
  /**
   * When set (and below maxHeight), full AO on this lower silhouette; influence fades
   * shape-wise from that core out to the outer maxHeight footprint edge.
   */
  coreHeightAboveBaseM?: number;
}

/** Stamp one prop instance mesh silhouette into the global R8 influence buffer. */
export function stampPropMeshFootprint(
  data: Uint8Array,
  texSize: number,
  worldSize: number,
  entity: Extract<MapEntity, { type: 'prop' }>,
  assets: AssetRegistry,
  surface: PropTerrainSurface,
  options: StampPropMeshFootprintOptions = {
    padM: VISUAL.grass.propGrassPadM,
    edgeFadeM: VISUAL.grass.propGrassEdgeFadeM,
  },
): void {
  const model = assets.get(entity.key)?.lod0;
  if (!model) return;

  const placement = entityToPlacement(entity);
  const alignToSlope = propAlignsToTerrainSlope(entity.key);
  const footLocal = computeModelFootLocal(model, _footLocal);
  resolvePropInstanceMatrix(placement, surface, alignToSlope, footLocal, _matrix);

  const baseY =
    surface.sampleSurfaceY(placement.x, placement.z) +
    placement.surfaceLift -
    VISUAL.props.surfaceSinkM;
  const maxWorldY =
    options.maxHeightAboveBaseM !== undefined
      ? baseY + options.maxHeightAboveBaseM
      : Number.POSITIVE_INFINITY;
  const useCoreFade = options.coreHeightAboveBaseM !== undefined;
  const coreWorldY = useCoreFade ? baseY + options.coreHeightAboveBaseM! : Number.POSITIVE_INFINITY;

  const texelSizeM = worldSize / texSize;
  const padTexels = Math.ceil(options.padM / texelSizeM);
  const edgeFadeTexels = Math.max(1, Math.ceil(options.edgeFadeM / texelSizeM));
  const margin = padTexels + edgeFadeTexels + 2;

  let minU = texSize;
  let minV = texSize;
  let maxU = 0;
  let maxV = 0;

  // Packed as u,v,y per vertex (9 floats per triangle). Bounds only from accepted triangles.
  const triangleVerts: number[] = [];

  const acceptTriangle = (
    ua: number,
    va: number,
    ya: number,
    ub: number,
    vb: number,
    yb: number,
    uc: number,
    vc: number,
    yc: number,
  ): void => {
    if (Math.min(ya, yb, yc) > maxWorldY) return;
    minU = Math.min(minU, ua, ub, uc);
    minV = Math.min(minV, va, vb, vc);
    maxU = Math.max(maxU, ua, ub, uc);
    maxV = Math.max(maxV, va, vb, vc);
    triangleVerts.push(ua, va, ya, ub, vb, yb, uc, vc, yc);
  };

  for (const mesh of extractMeshes(model)) {
    const pos = mesh.geometry.attributes.position;
    if (!pos) continue;
    const index = mesh.geometry.index;

    const projectVertex = (vi: number, target: Vector3): void => {
      target.fromBufferAttribute(pos, vi);
      target.applyMatrix4(_matrix);
    };

    if (index) {
      for (let t = 0; t < index.count; t += 3) {
        projectVertex(index.getX(t), _va);
        projectVertex(index.getX(t + 1), _vb);
        projectVertex(index.getX(t + 2), _vc);
        const a = worldToTexel(_va.x, _va.z, texSize, worldSize);
        const b = worldToTexel(_vb.x, _vb.z, texSize, worldSize);
        const c = worldToTexel(_vc.x, _vc.z, texSize, worldSize);
        acceptTriangle(a.u, a.v, _va.y, b.u, b.v, _vb.y, c.u, c.v, _vc.y);
      }
    } else {
      for (let vi = 0; vi < pos.count; vi += 3) {
        projectVertex(vi, _va);
        projectVertex(vi + 1, _vb);
        projectVertex(vi + 2, _vc);
        const a = worldToTexel(_va.x, _va.z, texSize, worldSize);
        const b = worldToTexel(_vb.x, _vb.z, texSize, worldSize);
        const c = worldToTexel(_vc.x, _vc.z, texSize, worldSize);
        acceptTriangle(a.u, a.v, _va.y, b.u, b.v, _vb.y, c.u, c.v, _vc.y);
      }
    }
  }

  if (triangleVerts.length === 0 || minU > maxU) return;

  const foot = worldToTexel(placement.x, placement.z, texSize, worldSize);
  const minCoreDiscTexels = MIN_CORE_DISC_M / texelSizeM;
  if (useCoreFade) {
    const corePad = minCoreDiscTexels + 1;
    minU = Math.min(minU, foot.u - corePad);
    minV = Math.min(minV, foot.v - corePad);
    maxU = Math.max(maxU, foot.u + corePad);
    maxV = Math.max(maxV, foot.v + corePad);
  }

  const originI = Math.max(0, Math.floor(minU) - margin);
  const originJ = Math.max(0, Math.floor(minV) - margin);
  const endI = Math.min(texSize - 1, Math.ceil(maxU) + margin);
  const endJ = Math.min(texSize - 1, Math.ceil(maxV) + margin);
  const localW = endI - originI + 1;
  const localH = endJ - originJ + 1;

  const inside = new Uint8Array(localW * localH);
  const core = useCoreFade ? new Uint8Array(localW * localH) : null;

  for (let t = 0; t < triangleVerts.length; t += 9) {
    const ya = triangleVerts[t + 2]!;
    const yb = triangleVerts[t + 5]!;
    const yc = triangleVerts[t + 8]!;
    const ua = triangleVerts[t]! - originI;
    const va = triangleVerts[t + 1]! - originJ;
    const ub = triangleVerts[t + 3]! - originI;
    const vb = triangleVerts[t + 4]! - originJ;
    const uc = triangleVerts[t + 6]! - originI;
    const vc = triangleVerts[t + 7]! - originJ;
    rasterizeTriangleHeightCulled(inside, localW, ua, va, ya, ub, vb, yb, uc, vc, yc, maxWorldY);
    if (core) {
      rasterizeTriangleHeightCulled(core, localW, ua, va, ya, ub, vb, yb, uc, vc, yc, coreWorldY);
    }
  }

  // Guarantee a core seed at the instance foot — empty core used to hard-fill the outer silhouette.
  if (core) {
    stampDiscMask(core, localW, localH, foot.u - originI, foot.v - originJ, minCoreDiscTexels);
    // Keep outer at least as large as the core disc so fade has a domain.
    stampDiscMask(inside, localW, localH, foot.u - originI, foot.v - originJ, minCoreDiscTexels);
  }

  const localInfluence = core
    ? influenceFromCoreToOuter(inside, core, localW, localH, padTexels, edgeFadeTexels)
    : influenceFromInsideMask(inside, localW, localH, padTexels, edgeFadeTexels);
  blitInfluenceMin(data, texSize, localInfluence, originI, originJ, localW, localH);
}

export function createPropGrassSurface(terrain: MapTerrainContext): PropTerrainSurface {
  return createPropTerrainSurface(terrain);
}

export function exclusionTextureSize(gridSize: number): number {
  return gridSize * EXCLUSION_TEXEL_SCALE;
}
