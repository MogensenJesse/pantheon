// src/world/village/assets/placeholder/meshBuilder.ts — flat-shaded, vertex-coloured solids for the placeholder kit
import alea from 'alea';
import { BufferGeometry, Float32BufferAttribute } from 'three';

export type Rgb = readonly [number, number, number];
export type V3 = readonly [number, number, number];

/** Axis-aligned box corner i = bx + 2*by + 4*bz (bit set = max). Quads are outward CCW. */
const BOX_FACES: readonly (readonly [number, number, number, number])[] = [
  [6, 7, 3, 2], // +Y
  [0, 1, 5, 4], // -Y
  [4, 5, 7, 6], // +Z
  [1, 0, 2, 3], // -Z
  [5, 1, 3, 7], // +X
  [0, 4, 6, 2], // -X
];

/**
 * Accumulates non-indexed triangles with a per-face normal and a tone-jittered vertex colour.
 * Yaw follows three Y rotation, so local +Z turns toward world +X as yaw grows.
 */
export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly rand: () => number;
  private cos = 1;
  private sin = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private readonly toneJitter: number;

  constructor(seed = 1, toneJitter = 0.05) {
    this.rand = alea(String(seed));
    this.toneJitter = toneJitter;
  }

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  /** Run fn in a child frame rotated by yaw and translated by (x, y, z) in this frame. */
  within(x: number, y: number, z: number, yaw: number, fn: () => void): this {
    const saved = [this.cos, this.sin, this.ox, this.oy, this.oz] as const;
    const [px, py, pz] = this.toWorld(x, y, z);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const nextCos = this.cos * c - this.sin * s;
    const nextSin = this.sin * c + this.cos * s;
    this.cos = nextCos;
    this.sin = nextSin;
    this.ox = px;
    this.oy = py;
    this.oz = pz;
    fn();
    [this.cos, this.sin, this.ox, this.oy, this.oz] = saved;
    return this;
  }

  tri(a: V3, b: V3, c: V3, color: Rgb): this {
    this.emit(this.toWorld(...a), this.toWorld(...b), this.toWorld(...c), this.jitter(color));
    return this;
  }

  /** a b c d counter-clockwise seen from outside. */
  quad(a: V3, b: V3, c: V3, d: V3, color: Rgb): this {
    const pa = this.toWorld(...a);
    const pb = this.toWorld(...b);
    const pc = this.toWorld(...c);
    const pd = this.toWorld(...d);
    const tone = this.jitter(color);
    this.emit(pa, pb, pc, tone);
    this.emit(pa, pc, pd, tone);
    return this;
  }

  /** Box centred on (cx, cz) with its bottom at y0. topColor tints the +Y face. */
  box(
    cx: number,
    y0: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    color: Rgb,
    topColor?: Rgb,
  ): this {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const y1 = y0 + sy;
    const corners: V3[] = [];
    for (let i = 0; i < 8; i++) {
      corners.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
    }
    return this.hexa(corners, color, topColor);
  }

  /** Square-section beam from a to b. */
  beam(a: V3, b: V3, size: number, color: Rgb): this {
    const t = norm(sub(b, a));
    const ref: V3 = Math.abs(t[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const r = norm(cross(ref, t));
    const u = cross(t, r);
    const h = size / 2;
    const corners: V3[] = [];
    for (let i = 0; i < 8; i++) {
      const end = i & 4 ? b : a;
      const sr = i & 1 ? h : -h;
      const su = i & 2 ? h : -h;
      corners.push([
        end[0] + r[0] * sr + u[0] * su,
        end[1] + r[1] * sr + u[1] * su,
        end[2] + r[2] * sr + u[2] * su,
      ]);
    }
    return this.hexa(corners, color);
  }

  /**
   * Closed gable roof: ridge along local X, the slope plane passes through the wall top (y0) at
   * z = +-d/2, then overhangs by overhang on every side.
   */
  gableRoof(
    cx: number,
    y0: number,
    cz: number,
    w: number,
    d: number,
    rise: number,
    overhang: number,
    color: Rgb,
  ): this {
    const slope = rise / (d / 2);
    const hx = w / 2 + overhang;
    const hz = d / 2 + overhang;
    const ye = y0 - overhang * slope;
    const yr = y0 + rise;
    const x0 = cx - hx;
    const x1 = cx + hx;
    const zf = cz + hz;
    const zb = cz - hz;
    this.quad([x0, ye, zf], [x1, ye, zf], [x1, yr, cz], [x0, yr, cz], color);
    this.quad([x1, ye, zb], [x0, ye, zb], [x0, yr, cz], [x1, yr, cz], color);
    this.quad([x0, ye, zb], [x1, ye, zb], [x1, ye, zf], [x0, ye, zf], color);
    this.tri([x0, ye, zb], [x0, ye, zf], [x0, yr, cz], color);
    this.tri([x1, ye, zf], [x1, ye, zb], [x1, yr, cz], color);
    return this;
  }

  /** Closed four-sided pyramid. */
  pyramid(cx: number, y0: number, cz: number, w: number, d: number, h: number, color: Rgb): this {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const apex: V3 = [cx, y0 + h, cz];
    this.tri([x0, y0, z1], [x1, y0, z1], apex, color);
    this.tri([x1, y0, z1], [x1, y0, z0], apex, color);
    this.tri([x1, y0, z0], [x0, y0, z0], apex, color);
    this.tri([x0, y0, z0], [x0, y0, z1], apex, color);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
    return this;
  }

  cylinder(
    cx: number,
    y0: number,
    cz: number,
    r: number,
    h: number,
    segments: number,
    color: Rgb,
    topColor?: Rgb,
  ): this {
    const y1 = y0 + h;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0: V3 = [cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r];
      const p1: V3 = [cx + Math.cos(a1) * r, 0, cz + Math.sin(a1) * r];
      this.quad(
        [p1[0], y0, p1[2]],
        [p0[0], y0, p0[2]],
        [p0[0], y1, p0[2]],
        [p1[0], y1, p1[2]],
        color,
      );
      this.tri([cx, y1, cz], [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], topColor ?? color);
      this.tri([cx, y0, cz], [p0[0], y0, p0[2]], [p1[0], y0, p1[2]], color);
    }
    return this;
  }

  cone(
    cx: number,
    y0: number,
    cz: number,
    r: number,
    h: number,
    segments: number,
    color: Rgb,
  ): this {
    const apex: V3 = [cx, y0 + h, cz];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0: V3 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
      const p1: V3 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      this.tri(p1, p0, apex, color);
      this.tri([cx, y0, cz], p0, p1, color);
    }
    return this;
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    return geometry;
  }

  /** Eight corners indexed bx + 2*by + 4*bz; inside-out frames are detected and reversed. */
  private hexa(c: readonly V3[], color: Rgb, topColor?: Rgb): this {
    const handed = dot(sub(c[1]!, c[0]!), cross(sub(c[2]!, c[0]!), sub(c[4]!, c[0]!))) >= 0;
    BOX_FACES.forEach(([a, b, cc, d], faceIndex) => {
      const tone = faceIndex === 0 && topColor ? topColor : color;
      const [qa, qb, qc, qd] = [c[a]!, c[b]!, c[cc]!, c[d]!];
      if (handed) this.quad(qa, qb, qc, qd, tone);
      else this.quad(qa, qd, qc, qb, tone);
    });
    return this;
  }

  private toWorld(x: number, y: number, z: number): V3 {
    return [
      x * this.cos + z * this.sin + this.ox,
      y + this.oy,
      -x * this.sin + z * this.cos + this.oz,
    ];
  }

  private jitter(color: Rgb): Rgb {
    const k = 1 + (this.rand() - 0.5) * 2 * this.toneJitter;
    return [Math.min(1, color[0] * k), Math.min(1, color[1] * k), Math.min(1, color[2] * k)];
  }

  /** World-space triangle; the flat normal comes from the winding. */
  private emit(a: V3, b: V3, c: V3, color: Rgb): void {
    const n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0] / len, n[1] / len, n[2] / len);
      this.col.push(color[0], color[1], color[2]);
    }
  }
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(v: V3): V3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Stable positive integer seed from a string (FNV-1a). */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
