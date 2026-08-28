// src/optimizer/pipeline/flattenPrimitives.ts — merge static primitives (no Three.js)
import type { PrimitivePayload } from './types';

export type FlattenedPrimitive = PrimitivePayload & { materialId: Float32Array };

export function flattenPrimitives(primitives: PrimitivePayload[]): FlattenedPrimitive {
  let vCount = 0;
  let iCount = 0;
  for (const p of primitives) {
    vCount += p.positions.length / 3;
    iCount += p.indices.length;
  }
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const colors = new Float32Array(vCount * 4);
  const materialId = new Float32Array(vCount);
  const indices = new Uint32Array(iCount);
  let vOff = 0;
  let iOff = 0;
  primitives.forEach((p, pi) => {
    const n = p.positions.length / 3;
    positions.set(p.positions, vOff * 3);
    if (p.normals) normals.set(p.normals, vOff * 3);
    if (p.uvs) uvs.set(p.uvs, vOff * 2);
    if (p.colors) {
      colors.set(p.colors, vOff * 4);
    } else {
      colors.fill(1, vOff * 4, (vOff + n) * 4);
    }
    materialId.fill(pi, vOff, vOff + n);
    for (let i = 0; i < p.indices.length; i++) indices[iOff + i] = p.indices[i] + vOff;
    vOff += n;
    iOff += p.indices.length;
  });
  return {
    positions,
    normals,
    uvs,
    colors,
    indices,
    materialName: primitives[0]?.materialName ?? 'Atlas',
    materialIndex: 0,
    materialId,
  };
}
