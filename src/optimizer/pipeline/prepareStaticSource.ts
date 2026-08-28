// src/optimizer/pipeline/prepareStaticSource.ts — flatten supported static triangles
import {
  BufferAttribute,
  BufferGeometry,
  type Material,
  Matrix3,
  type Matrix4,
  type Object3D,
} from 'three';
import type { PrimitivePayload } from './types';

export { flattenPrimitives } from './flattenPrimitives';

const _mat3 = new Matrix3();

type AttrLike = {
  count: number;
  itemSize: number;
  getComponent: (index: number, component: number) => number;
};

function isMesh(
  obj: Object3D,
): obj is Object3D & { geometry: BufferGeometry; material: Material | Material[] } {
  return (
    (obj as { isMesh?: boolean }).isMesh === true &&
    (obj as { isSkinnedMesh?: boolean }).isSkinnedMesh !== true
  );
}

/** Packed copy — never use `attr.array` (that is the full interleaved buffer on many GLBs). */
function copyAttr(attr: AttrLike | undefined, itemSize: number): Float32Array | null {
  if (!attr || attr.count <= 0) return null;
  const n = attr.count;
  const comps = Math.min(itemSize, attr.itemSize);
  const out = new Float32Array(n * itemSize);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < comps; k++) out[i * itemSize + k] = attr.getComponent(i, k);
  }
  if (itemSize === 4 && attr.itemSize < 4) {
    for (let i = 0; i < n; i++) out[i * 4 + 3] = 1;
  }
  return out;
}

function toUint32Index(geo: BufferGeometry, posCount: number): Uint32Array {
  const index = geo.getIndex();
  if (index) {
    const n = index.count;
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = index.getX(i);
    return out;
  }
  const usable = Math.floor(posCount / 3) * 3;
  const out = new Uint32Array(usable);
  for (let i = 0; i < usable; i++) out[i] = i;
  return out;
}

function triangleIndices(src: Uint32Array, vertexCount: number): Uint32Array {
  const triCount = Math.floor(src.length / 3);
  const tmp = new Uint32Array(triCount * 3);
  let w = 0;
  for (let t = 0; t < triCount; t++) {
    const a = src[t * 3];
    const b = src[t * 3 + 1];
    const c = src[t * 3 + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) continue;
    if (a === b || b === c || a === c) continue;
    tmp[w] = a;
    tmp[w + 1] = b;
    tmp[w + 2] = c;
    w += 3;
  }
  return tmp.slice(0, w);
}

function applyWorld(
  positions: Float32Array,
  normals: Float32Array | null,
  matrixWorld: Matrix4,
): void {
  _mat3.getNormalMatrix(matrixWorld);
  const e = matrixWorld.elements;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    positions[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    positions[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    positions[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (normals) {
      const nx = normals[i];
      const ny = normals[i + 1];
      const nz = normals[i + 2];
      const rx = _mat3.elements[0] * nx + _mat3.elements[3] * ny + _mat3.elements[6] * nz;
      const ry = _mat3.elements[1] * nx + _mat3.elements[4] * ny + _mat3.elements[7] * nz;
      const rz = _mat3.elements[2] * nx + _mat3.elements[5] * ny + _mat3.elements[8] * nz;
      const len = Math.hypot(rx, ry, rz) || 1;
      normals[i] = rx / len;
      normals[i + 1] = ry / len;
      normals[i + 2] = rz / len;
    }
  }
}

function compactPrimitive(
  positions: Float32Array,
  normals: Float32Array | null,
  uvs: Float32Array | null,
  colors: Float32Array | null,
  colorStride: number,
  indices: Uint32Array,
  materialName: string,
  materialIndex: number,
): PrimitivePayload {
  const used = new Map<number, number>();
  const newIndex = new Uint32Array(indices.length);
  let next = 0;
  for (let i = 0; i < indices.length; i++) {
    const src = indices[i];
    let dst = used.get(src);
    if (dst === undefined) {
      dst = next++;
      used.set(src, dst);
    }
    newIndex[i] = dst;
  }
  const pos = new Float32Array(next * 3);
  const nrm = normals ? new Float32Array(next * 3) : null;
  const uv = uvs ? new Float32Array(next * 2) : null;
  const col = colors ? new Float32Array(next * 4) : null;
  used.forEach((dst, src) => {
    pos[dst * 3] = positions[src * 3];
    pos[dst * 3 + 1] = positions[src * 3 + 1];
    pos[dst * 3 + 2] = positions[src * 3 + 2];
    if (nrm && normals) {
      nrm[dst * 3] = normals[src * 3];
      nrm[dst * 3 + 1] = normals[src * 3 + 1];
      nrm[dst * 3 + 2] = normals[src * 3 + 2];
    }
    if (uv && uvs) {
      uv[dst * 2] = uvs[src * 2];
      uv[dst * 2 + 1] = uvs[src * 2 + 1];
    }
    if (col && colors) {
      col[dst * 4] = colors[src * colorStride] ?? 1;
      col[dst * 4 + 1] = colors[src * colorStride + 1] ?? 1;
      col[dst * 4 + 2] = colors[src * colorStride + 2] ?? 1;
      col[dst * 4 + 3] = colorStride === 4 ? (colors[src * colorStride + 3] ?? 1) : 1;
    }
  });
  return {
    positions: pos,
    normals: nrm,
    uvs: uv,
    colors: col,
    indices: newIndex,
    materialName,
    materialIndex,
  };
}

export function collectStaticPrimitives(root: Object3D): PrimitivePayload[] {
  root.updateMatrixWorld(true);
  const primitives: PrimitivePayload[] = [];
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    const geo = obj.geometry;
    const posAttr = geo.getAttribute('position');
    if (!posAttr) return;
    const positions = copyAttr(posAttr, 3);
    if (!positions) return;
    const nrmAttr = geo.getAttribute('normal');
    const uvAttr = geo.getAttribute('uv');
    const colAttr = geo.getAttribute('color');
    const normals = copyAttr(nrmAttr, 3);
    const uvs = copyAttr(uvAttr, 2);
    const colorStride = colAttr && colAttr.itemSize === 3 ? 3 : 4;
    const colors = copyAttr(colAttr, colorStride);
    applyWorld(positions, normals, obj.matrixWorld);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const groups =
      geo.groups.length > 0 ? geo.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    let fullIndex = toUint32Index(geo, posAttr.count);
    const draw = geo.drawRange;
    if (
      Number.isFinite(draw.count) &&
      draw.count > 0 &&
      draw.start + draw.count <= fullIndex.length
    ) {
      fullIndex = fullIndex.subarray(draw.start, draw.start + draw.count);
    }
    const vertexCount = posAttr.count;
    for (const group of groups) {
      const matIndex = group.materialIndex ?? 0;
      const mat = mats[matIndex] ?? mats[0];
      const start = group.start;
      const count = Number.isFinite(group.count) ? group.count : fullIndex.length - start;
      const indices = triangleIndices(fullIndex.subarray(start, start + count), vertexCount);
      if (indices.length < 3) continue;
      primitives.push(
        compactPrimitive(
          positions,
          normals,
          uvs,
          colors,
          colorStride,
          indices,
          mat?.name?.trim() || obj.name || 'Material',
          primitives.length,
        ),
      );
    }
  });
  return primitives;
}

export function primitiveToGeometry(p: PrimitivePayload): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(p.positions, 3));
  if (p.normals) geo.setAttribute('normal', new BufferAttribute(p.normals, 3));
  if (p.uvs) geo.setAttribute('uv', new BufferAttribute(p.uvs, 2));
  if (p.tangents) geo.setAttribute('tangent', new BufferAttribute(p.tangents, 4));
  if (p.colors) {
    const n = p.positions.length / 3;
    const itemSize = p.colors.length === n * 4 ? 4 : 3;
    geo.setAttribute('color', new BufferAttribute(p.colors, itemSize));
  }
  geo.setIndex(new BufferAttribute(p.indices, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
