// src/world/snow/snowSurfaceMesh.ts — the shell as one snapped clipmap draw (levels and snapping: cpu/snowClipmap.ts)
//
// The mesh sits at the origin; the vertex shader moves every vertex to its level's snapped lattice around `uCam`.
import { BufferAttribute, BufferGeometry, type Material, Mesh } from 'three';
import { buildClipmapArrays, type ClipmapSpec } from './cpu/snowClipmap';

export interface SnowSurfaceMesh {
  mesh: Mesh;
  triangles: number;
  dispose: () => void;
}

export function createSnowSurfaceMesh(material: Material, spec: ClipmapSpec): SnowSurfaceMesh {
  const arrays = buildClipmapArrays(spec);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('aCell', new BufferAttribute(arrays.cell, 1));
  geometry.setIndex(new BufferAttribute(arrays.indices, 1));
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Snow shell';
  // The vertex shader moves everything: the bounds are meaningless, and the shell draws before the terrain it hides.
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.visible = false;
  return {
    mesh,
    triangles: arrays.triangles,
    dispose: () => geometry.dispose(),
  };
}
