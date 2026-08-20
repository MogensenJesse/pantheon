// src/entities/guideLine/guideGlowMap.ts — world-XZ RG falloff+along atlas along the guide ribbon
import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearFilter,
  NoColorSpace,
  RGFormat,
} from 'three';
import { WORLD } from '../../config/world';
import type { GuideSample } from './guidePolyline';

export interface GuideGlowMap {
  texture: DataTexture;
  stamp: (points: GuideSample[], radiusM: number) => number;
  clear: () => void;
  dispose: () => void;
}

/** Independent of height-grid size — 10 m glow does not need ~1.6 m texels. */
const GUIDE_GLOW_ATLAS_SIZE = 256;

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function createGuideGlowMap(
  worldSize: number = WORLD.SIZE,
  texSize: number = GUIDE_GLOW_ATLAS_SIZE,
): GuideGlowMap {
  const size = Math.max(8, texSize | 0);
  const data = new Float32Array(size * size * 2);
  const tex = new DataTexture(data, size, size, RGFormat, FloatType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const stampDisc = (cx: number, cz: number, radiusM: number, alongNorm: number) => {
    const texelSize = worldSize / size;
    const px = (cx / worldSize + 0.5) * size;
    const pz = (cz / worldSize + 0.5) * size;
    const rTex = Math.max(1, Math.ceil(radiusM / texelSize));
    for (let j = -rTex; j <= rTex; j++) {
      const z = (pz + j) | 0;
      if (z < 0 || z >= size) continue;
      const row = z * size;
      for (let i = -rTex; i <= rTex; i++) {
        const x = (px + i) | 0;
        if (x < 0 || x >= size) continue;
        const dM = Math.hypot(i * texelSize, j * texelSize);
        if (dM >= radiusM) continue;
        const falloff = 1 - smoothstep01(dM / radiusM);
        const idx = (row + x) * 2;
        if (falloff > data[idx]!) {
          data[idx] = falloff;
          data[idx + 1] = alongNorm;
        }
      }
    }
  };

  const stamp = (points: GuideSample[], radiusM: number): number => {
    data.fill(0);
    const radius = Math.max(0.15, radiusM);
    let maxAlong = 0;
    for (let i = 0; i < points.length; i++) {
      const along = points[i]!.along;
      if (along > maxAlong) maxAlong = along;
    }
    const alongScale = Math.max(1, maxAlong);
    const n = points.length;
    const avgSpacing = n > 1 ? maxAlong / (n - 1) : radius;
    const stride = Math.max(1, Math.round(radius / 3 / Math.max(avgSpacing, 0.01)));
    const stampPoint = (i: number) => {
      const p = points[i]!;
      stampDisc(p.x, p.z, radius, p.along / alongScale);
    };
    for (let i = 0; i < n; i += stride) {
      stampPoint(i);
    }
    const last = n - 1;
    if (last > 0 && last % stride !== 0) {
      stampPoint(last);
    }
    tex.needsUpdate = true;
    return alongScale;
  };

  const clear = () => {
    data.fill(0);
    tex.needsUpdate = true;
  };

  const dispose = () => {
    tex.dispose();
  };

  return { texture: tex, stamp, clear, dispose };
}
