// src/world/water/mesh/waterDiscGeometry.ts — the ocean as a disc of rings, finest at its centre (the camera)
//
// Ring radius grows by `ringGrowth` per ring out to `fineToM`, then by `coarseGrowth` to the rim, so the cell size
// is a fixed share of the distance: fine where the swell is seen, a few rings of nothing where it is not. No seams
// (the angular segments wrap) and no T-junctions. Lies in the local XY plane facing +Z, like `CircleGeometry`.
import { BufferAttribute, BufferGeometry } from 'three';

export interface WaterDiscOptions {
  /** Radius (m) of the rim. */
  radius: number;
  /** Radius (m) of the first ring: inside it is one fan. */
  innerM: number;
  /** Segments around. */
  segments: number;
  ringGrowth: number;
  fineToM: number;
  coarseGrowth: number;
}

/** Ring radii from the first ring out to exactly `radius`. */
export function waterDiscRadii(o: WaterDiscOptions): number[] {
  const radii = [o.innerM];
  while (radii[radii.length - 1] < o.radius) {
    const r = radii[radii.length - 1];
    radii.push(Math.min(r * (1 + (r < o.fineToM ? o.ringGrowth : o.coarseGrowth)), o.radius));
  }
  return radii;
}

export function createWaterDiscGeometry(o: WaterDiscOptions): BufferGeometry {
  const radii = waterDiscRadii(o);
  const n = o.segments;
  const vertexCount = 1 + radii.length * n;
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  normal.fill(0);
  for (let i = 0; i < vertexCount; i++) normal[i * 3 + 2] = 1;
  uv.fill(0.5);
  // vertex 0 is the centre, ring j vertex i is 1 + j * n + i
  for (let j = 0; j < radii.length; j++) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = 1 + j * n + i;
      position[v * 3] = Math.cos(a) * radii[j];
      position[v * 3 + 1] = Math.sin(a) * radii[j];
      uv[v * 2] = 0.5 + (Math.cos(a) * radii[j]) / (2 * o.radius);
      uv[v * 2 + 1] = 0.5 + (Math.sin(a) * radii[j]) / (2 * o.radius);
    }
  }
  const index = new Uint32Array((n + (radii.length - 1) * n * 2) * 3);
  let k = 0;
  for (let i = 0; i < n; i++) {
    index[k++] = 0;
    index[k++] = 1 + i;
    index[k++] = 1 + ((i + 1) % n);
  }
  for (let j = 0; j < radii.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const inner = 1 + j * n + i;
      const innerNext = 1 + j * n + ((i + 1) % n);
      const outer = 1 + (j + 1) * n + i;
      const outerNext = 1 + (j + 1) * n + ((i + 1) % n);
      index[k++] = inner;
      index[k++] = outer;
      index[k++] = outerNext;
      index[k++] = inner;
      index[k++] = outerNext;
      index[k++] = innerNext;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}
