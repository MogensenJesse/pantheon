// src/optimizer/pipeline/weld.ts — position weld used after remesh soup
export function weldPositions(
  positions: Float32Array,
  digits = 6,
): { positions: Float32Array; indices: Uint32Array } {
  const scale = 10 ** digits;
  const map = new Map<string, number>();
  const verts: number[] = [];
  const indices = new Uint32Array(positions.length / 3);
  let unique = 0;
  for (let i = 0; i < indices.length; i++) {
    const x = Math.round(positions[i * 3] * scale);
    const y = Math.round(positions[i * 3 + 1] * scale);
    const z = Math.round(positions[i * 3 + 2] * scale);
    const key = `${x},${y},${z}`;
    let id = map.get(key);
    if (id === undefined) {
      id = unique++;
      map.set(key, id);
      verts.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    indices[i] = id;
  }
  return { positions: new Float32Array(verts), indices };
}

export function computeVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const n = positions.length / 3;
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i];
    const ib = indices[i + 1];
    const ic = indices[i + 2];
    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];
    const bx = positions[ib * 3];
    const by = positions[ib * 3 + 1];
    const bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3];
    const cy = positions[ic * 3 + 1];
    const cz = positions[ic * 3 + 2];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    normals[ia * 3] += nx;
    normals[ia * 3 + 1] += ny;
    normals[ia * 3 + 2] += nz;
    normals[ib * 3] += nx;
    normals[ib * 3 + 1] += ny;
    normals[ib * 3 + 2] += nz;
    normals[ic * 3] += nx;
    normals[ic * 3 + 1] += ny;
    normals[ic * 3 + 2] += nz;
  }
  for (let i = 0; i < n; i++) {
    const x = normals[i * 3];
    const y = normals[i * 3 + 1];
    const z = normals[i * 3 + 2];
    const len = Math.hypot(x, y, z) || 1;
    normals[i * 3] = x / len;
    normals[i * 3 + 1] = y / len;
    normals[i * 3 + 2] = z / len;
  }
  return normals;
}
