// src/optimizer/pipeline/simplifyPreserveUv.ts — per-primitive meshoptimizer simplify
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import type { GeometryJobResult, PrimitivePayload } from './types';

export async function whenSimplifierReady(): Promise<void> {
  if (!MeshoptSimplifier.supported) {
    throw new Error('meshoptimizer simplifier WASM is not supported');
  }
  await MeshoptSimplifier.ready;
}

function packAttributes(p: PrimitivePayload): {
  attrs: Float32Array;
  stride: number;
  weights: number[];
} {
  const n = p.positions.length / 3;
  const parts: { data: Float32Array; size: number; weight: number }[] = [];
  if (p.normals) parts.push({ data: p.normals, size: 3, weight: 1 });
  if (p.uvs) parts.push({ data: p.uvs, size: 2, weight: 1 });
  if (p.colors) {
    const size = p.colors.length === n * 4 ? 4 : 3;
    parts.push({ data: p.colors, size, weight: 0.35 });
  }
  const stride = parts.reduce((s, part) => s + part.size, 0);
  if (stride === 0) return { attrs: new Float32Array(0), stride: 0, weights: [] };
  const attrs = new Float32Array(n * stride);
  const weights: number[] = [];
  let offset = 0;
  for (const part of parts) {
    for (let k = 0; k < part.size; k++) weights.push(part.weight);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < part.size; k++) {
        attrs[i * stride + offset + k] = part.data[i * part.size + k];
      }
    }
    offset += part.size;
  }
  return { attrs, stride, weights };
}

function remapAttr(
  src: Float32Array | null,
  itemSize: number,
  remap: Uint32Array,
  unique: number,
): Float32Array | null {
  if (!src) return null;
  const out = new Float32Array(unique * itemSize);
  const n = src.length / itemSize;
  for (let i = 0; i < n; i++) {
    const dst = remap[i];
    if (dst === undefined || dst >= unique) continue;
    for (let k = 0; k < itemSize; k++) out[dst * itemSize + k] = src[i * itemSize + k];
  }
  return out;
}

export function simplifyPrimitive(
  p: PrimitivePayload,
  targetIndexCount: number,
  targetError = 0.02,
): PrimitivePayload {
  if (p.indices.length < 3 || p.indices.length % 3 !== 0) {
    throw new Error(
      `Preserve UVs: index count ${p.indices.length} is not a triangle list (multiple of 3).`,
    );
  }
  const want = Math.max(3, Math.min(p.indices.length, Math.floor(targetIndexCount / 3) * 3));
  const { attrs, stride, weights } = packAttributes(p);
  const [indices, _error] = MeshoptSimplifier.simplifyWithAttributes(
    p.indices,
    p.positions,
    3,
    attrs,
    stride,
    weights,
    null,
    want,
    targetError,
    ['LockBorder'],
  );
  const [remap, unique] = MeshoptSimplifier.compactMesh(indices);
  const positions = remapAttr(p.positions, 3, remap, unique)!;
  const n = p.positions.length / 3;
  const colorSize = p.colors ? (p.colors.length === n * 4 ? 4 : 3) : 4;
  return {
    positions,
    normals: remapAttr(p.normals, 3, remap, unique),
    uvs: remapAttr(p.uvs, 2, remap, unique),
    colors: remapAttr(p.colors, colorSize, remap, unique),
    indices,
    materialName: p.materialName,
    materialIndex: p.materialIndex,
  };
}

export function simplifyPrimitives(
  primitives: PrimitivePayload[],
  targetTriangles: number,
  generation: number,
): GeometryJobResult {
  const original = primitives.reduce((s, p) => s + p.indices.length / 3, 0);
  const warnings: string[] = [];
  const notes: string[] = [];
  if (original <= 0) {
    return {
      generation,
      primitives: [],
      stats: {
        triangles: 0,
        vertices: 0,
        meshes: 0,
        materials: 0,
        drawCalls: 0,
        textureBytesEst: 0,
      },
      warnings: ['No triangles to simplify'],
      notes,
    };
  }
  const out: PrimitivePayload[] = [];
  let allocated = 0;
  primitives.forEach((p, i) => {
    const share = p.indices.length / 3 / original;
    const remainingPrims = primitives.length - i;
    const remainingTarget = Math.max(remainingPrims, targetTriangles - allocated);
    const wantTris = Math.max(1, Math.round(targetTriangles * share));
    const capped = Math.min(wantTris, remainingTarget);
    const simplified = simplifyPrimitive(p, capped * 3);
    allocated += simplified.indices.length / 3;
    out.push(simplified);
  });
  const achieved = out.reduce((s, p) => s + p.indices.length / 3, 0);
  const verts = out.reduce((s, p) => s + p.positions.length / 3, 0);
  if (achieved > targetTriangles * 1.15) {
    warnings.push(
      `Simplifier stopped at ${Math.round(achieved)} triangles (requested ${targetTriangles}). UV seams and topology often prevent the target.`,
    );
  } else {
    notes.push(
      `Preserve UVs: ${Math.round(original)} → ${Math.round(achieved)} triangles (requested ${targetTriangles}).`,
    );
  }
  return {
    generation,
    primitives: out,
    stats: {
      triangles: Math.round(achieved),
      vertices: verts,
      meshes: out.length,
      materials: new Set(out.map((p) => p.materialName)).size,
      drawCalls: out.length,
      textureBytesEst: 0,
    },
    warnings,
    notes,
  };
}
