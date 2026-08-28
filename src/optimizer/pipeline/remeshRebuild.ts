// src/optimizer/pipeline/remeshRebuild.ts — voxel remesh + simplify toward target
import {
  type ExposedRemeshFlag,
  remeshPositions,
  VendoredMeshoptSimplifier,
  whenRemesherReady,
} from '../vendor/remeshAdapter';
import type { GeometryJobResult, PrimitivePayload, RemeshFlag } from './types';
import { computeVertexNormals, weldPositions } from './weld';

export { whenRemesherReady };

function resolutionForTarget(targetTriangles: number): number {
  const r = Math.round(Math.cbrt(Math.max(64, targetTriangles)) * 3.2);
  return Math.min(128, Math.max(16, r));
}

export async function remeshAndRefine(
  source: PrimitivePayload,
  targetTriangles: number,
  flags: RemeshFlag[],
  generation: number,
): Promise<GeometryJobResult> {
  await whenRemesherReady();
  if (source.indices.length < 3 || source.indices.length % 3 !== 0) {
    throw new Error(
      `Voxel remesh: index count ${source.indices.length} is not a triangle list (multiple of 3).`,
    );
  }
  const soup = remeshPositions(
    source.indices,
    source.positions,
    resolutionForTarget(targetTriangles),
    flags as ExposedRemeshFlag[],
  );
  if (soup.length < 9 || soup.length % 3 !== 0) {
    throw new Error(`Voxel remesh returned an empty or invalid soup (${soup.length} floats).`);
  }
  const welded = weldPositions(soup);
  const want = Math.max(3, Math.floor(targetTriangles * 3));
  const [simplified] = VendoredMeshoptSimplifier.simplify(
    welded.indices,
    welded.positions,
    3,
    want,
    0.02,
    ['PreserveFolds', 'LockBorder'],
  );
  const [remap, unique] = VendoredMeshoptSimplifier.compactMesh(simplified);
  const positions = new Float32Array(unique * 3);
  const srcN = welded.positions.length / 3;
  for (let i = 0; i < srcN; i++) {
    const dst = remap[i];
    if (dst === undefined || dst >= unique) continue;
    positions[dst * 3] = welded.positions[i * 3];
    positions[dst * 3 + 1] = welded.positions[i * 3 + 1];
    positions[dst * 3 + 2] = welded.positions[i * 3 + 2];
  }
  const normals = computeVertexNormals(positions, simplified);
  const primitive: PrimitivePayload = {
    positions,
    normals,
    uvs: null,
    colors: null,
    indices: simplified,
    materialName: source.materialName || 'Atlas',
    materialIndex: 0,
  };
  const tris = simplified.length / 3;
  const warnings: string[] = [];
  if (tris > targetTriangles * 1.2) {
    warnings.push(
      `Remesh/simplify reached ${Math.round(tris)} triangles (requested ${targetTriangles}). Showing achieved count.`,
    );
  }
  return {
    generation,
    primitives: [primitive],
    stats: {
      triangles: Math.round(tris),
      vertices: unique,
      meshes: 1,
      materials: 1,
      drawCalls: 1,
      textureBytesEst: 0,
    },
    warnings,
    notes: [
      `Rebuild remesh @ resolution ${resolutionForTarget(targetTriangles)} (${flags.join('+') || 'default'}).`,
    ],
  };
}
