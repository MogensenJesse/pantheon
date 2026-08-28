// src/optimizer/pipeline/atlasUv.ts — watlas unwrap + xref attribute remap

import { MeshoptTangents } from 'meshoptimizer/tangents';
import { Atlas, Initialize } from 'watlas';
import type { PrimitivePayload } from './types';

let watlasReady: Promise<void> | null = null;

export function whenWatlasReady(): Promise<void> {
  watlasReady ??= Initialize();
  return watlasReady;
}

export async function atlasUnwrap(
  primitive: PrimitivePayload,
  resolution: number,
  padding = 2,
): Promise<PrimitivePayload & { atlasWidth: number; atlasHeight: number }> {
  await whenWatlasReady();
  await MeshoptTangents.ready;
  const atlas = new Atlas();
  try {
    atlas.addMesh({
      vertexPositionData: primitive.positions,
      vertexCount: primitive.positions.length / 3,
      vertexPositionStride: 12,
      vertexNormalData: primitive.normals ?? undefined,
      vertexNormalStride: primitive.normals ? 12 : undefined,
      indexData: primitive.indices,
      indexCount: primitive.indices.length,
    });
    atlas.generate({ normalSeamWeight: 4 }, { resolution, padding, bilinear: true });
    const mesh = atlas.getMesh(0);
    const width = atlas.width;
    const height = atlas.height;
    const vertexCount = mesh.vertexCount;
    const indexCount = mesh.indexCount;
    if (width < 2 || height < 2 || vertexCount === 0 || indexCount < 3) {
      throw new Error(
        `Rebuild atlas unwrap failed (${width}x${height}, ${vertexCount} verts, ${indexCount} indices)`,
      );
    }
    const indices = new Uint32Array(indexCount);
    mesh.getIndexArray(indices);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const colors = primitive.colors ? new Float32Array(vertexCount * 4) : null;
    const srcN = primitive.positions.length / 3;
    const colorSize = primitive.colors ? (primitive.colors.length === srcN * 4 ? 4 : 3) : 4;
    for (let i = 0; i < vertexCount; i++) {
      const v = mesh.getVertex(i);
      const xref = v.xref;
      positions[i * 3] = primitive.positions[xref * 3];
      positions[i * 3 + 1] = primitive.positions[xref * 3 + 1];
      positions[i * 3 + 2] = primitive.positions[xref * 3 + 2];
      if (primitive.normals) {
        normals[i * 3] = primitive.normals[xref * 3];
        normals[i * 3 + 1] = primitive.normals[xref * 3 + 1];
        normals[i * 3 + 2] = primitive.normals[xref * 3 + 2];
      }
      uvs[i * 2] = v.uv[0] / width;
      uvs[i * 2 + 1] = v.uv[1] / height;
      if (colors && primitive.colors) {
        colors[i * 4] = primitive.colors[xref * colorSize] ?? 1;
        colors[i * 4 + 1] = primitive.colors[xref * colorSize + 1] ?? 1;
        colors[i * 4 + 2] = primitive.colors[xref * colorSize + 2] ?? 1;
        colors[i * 4 + 3] = colorSize === 4 ? (primitive.colors[xref * colorSize + 3] ?? 1) : 1;
      }
    }
    const tangents = MeshoptTangents.generateTangents(indices, positions, 3, normals, 3, uvs, 2, [
      'Compatible',
    ]);
    const result: PrimitivePayload & {
      atlasWidth: number;
      atlasHeight: number;
      tangents: Float32Array;
    } = {
      positions,
      normals,
      uvs,
      colors,
      indices,
      materialName: primitive.materialName,
      materialIndex: 0,
      atlasWidth: width,
      atlasHeight: height,
      tangents,
    };
    return result;
  } finally {
    atlas.delete();
  }
}
