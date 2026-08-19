// src/entities/guideLine/guideGlowMap.ts — world-XZ RGBA falloff+along atlas along the guide ribbon
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { WORLD } from '../../config/world';
import type { GuideSample } from './guidePolyline';

export interface GuideGlowMap {
  texture: DataTexture;
  stamp: (points: GuideSample[], radiusM: number) => number;
  clear: () => void;
  dispose: () => void;
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function createGuideGlowMap(
  worldSize: number = WORLD.SIZE,
  texSize: number = 512,
): GuideGlowMap {
  const size = Math.max(8, texSize | 0);
  const data = new Uint8Array(size * size * 4);
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;

  const stampDisc = (cx: number, cz: number, radiusM: number, alongByte: number) => {
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
        const packed = (falloff * 255) | 0;
        const idx = (row + x) * 4;
        if (packed > data[idx]!) {
          data[idx] = packed;
          data[idx + 1] = alongByte;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
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
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const alongByte = Math.max(0, Math.min(255, Math.round((p.along / alongScale) * 255)));
      stampDisc(p.x, p.z, radius, alongByte);
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
