// src/rendering/ensureGeometryUv.ts — WebGPU node materials expect a `uv` attribute
import { BufferGeometry, Float32BufferAttribute, type Object3D } from 'three';

/** Some meshes (Points, GLTF grass) lack UVs; node conversion warns without this. */
export function ensureGeometryUv(geometry: BufferGeometry): void {
  if (geometry.attributes.uv) return;
  const pos = geometry.attributes.position;
  if (!pos) return;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = pos.getX(i);
    uvs[i * 2 + 1] = pos.getZ(i);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
}

/** Ensure drawables (Mesh, Points, etc.) have a `uv` attribute before `compileAsync`. */
export function ensureSceneGeometryUv(root: Object3D): void {
  root.traverse((obj) => {
    const drawable = obj as { geometry?: BufferGeometry };
    if (drawable.geometry instanceof BufferGeometry) {
      ensureGeometryUv(drawable.geometry);
    }
  });
}
