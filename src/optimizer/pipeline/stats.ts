// src/optimizer/pipeline/stats.ts — mesh / texture memory estimates
import type { BufferGeometry, Material, Object3D, Texture } from 'three';
import type { MeshStats } from './types';

function isMesh(
  obj: Object3D,
): obj is Object3D & { geometry: BufferGeometry; material: Material | Material[] } {
  return (obj as { isMesh?: boolean }).isMesh === true;
}

function textureBytes(tex: Texture | null | undefined): number {
  if (!tex?.image) return 0;
  const w = Number((tex.image as { width?: number } | undefined)?.width) || 0;
  const h = Number((tex.image as { height?: number } | undefined)?.height) || 0;
  if (w <= 0 || h <= 0) return 0;
  const mip = tex.generateMipmaps ? 1.33 : 1;
  return Math.round(w * h * 4 * mip);
}

function materialTextureBytes(mat: Material): number {
  const m = mat as Material & Record<string, Texture | null | undefined>;
  let bytes = 0;
  for (const key of [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'alphaMap',
    'emissiveMap',
    'bumpMap',
  ]) {
    bytes += textureBytes(m[key]);
  }
  return bytes;
}

export function countGeometry(root: Object3D): MeshStats {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  const materials = new Set<Material>();
  let textureBytesEst = 0;

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    meshes += 1;
    const geo = obj.geometry;
    const pos = geo.getAttribute('position');
    if (pos) vertices += pos.count;
    const index = geo.getIndex();
    if (index) triangles += index.count / 3;
    else if (pos) triangles += pos.count / 3;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || materials.has(mat)) continue;
      materials.add(mat);
      textureBytesEst += materialTextureBytes(mat);
    }
  });

  return {
    triangles: Math.round(triangles),
    vertices,
    meshes,
    materials: materials.size,
    drawCalls: meshes,
    textureBytesEst,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function reductionPct(original: number, result: number): number {
  if (original <= 0) return 0;
  return Math.round((1 - result / original) * 1000) / 10;
}
