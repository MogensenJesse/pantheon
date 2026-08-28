// src/map/authoring/aspectFitGrid.ts — letterbox a source raster into a square map grid

export interface AspectFitRect {
  dstW: number;
  dstH: number;
  i0: number;
  j0: number;
}

export function aspectFitRect(srcW: number, srcH: number, dstSize: number): AspectFitRect {
  if (srcW <= 0 || srcH <= 0 || dstSize <= 0) {
    throw new Error(`Invalid aspect-fit size ${srcW}×${srcH} → ${dstSize}`);
  }
  const scale = dstSize / Math.max(srcW, srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  return {
    dstW: Math.min(dstSize, dstW),
    dstH: Math.min(dstSize, dstH),
    i0: Math.floor((dstSize - Math.min(dstSize, dstW)) / 2),
    j0: Math.floor((dstSize - Math.min(dstSize, dstH)) / 2),
  };
}

export function sampleBilinearScalar(
  src: Float32Array,
  srcW: number,
  srcH: number,
  u: number,
  v: number,
): number {
  const x = u * (srcW - 1);
  const y = v * (srcH - 1);
  const i0 = Math.min(srcW - 1, Math.max(0, Math.floor(x)));
  const j0 = Math.min(srcH - 1, Math.max(0, Math.floor(y)));
  const i1 = Math.min(srcW - 1, i0 + 1);
  const j1 = Math.min(srcH - 1, j0 + 1);
  const tx = x - i0;
  const ty = y - j0;
  const h00 = src[j0 * srcW + i0]!;
  const h10 = src[j0 * srcW + i1]!;
  const h01 = src[j1 * srcW + i0]!;
  const h11 = src[j1 * srcW + i1]!;
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
}

/** Stretch the source across the whole destination square (legacy EXR import). */
export function resampleChannelStretch(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstSize: number,
  flipY: boolean,
): Float32Array {
  const dst = new Float32Array(dstSize * dstSize);
  const max = dstSize - 1;
  for (let j = 0; j < dstSize; j++) {
    const vRaw = max === 0 ? 0 : j / max;
    const v = flipY ? 1 - vRaw : vRaw;
    for (let i = 0; i < dstSize; i++) {
      const u = max === 0 ? 0 : i / max;
      dst[j * dstSize + i] = sampleBilinearScalar(src, srcW, srcH, u, v);
    }
  }
  return dst;
}

export function aspectFitScalar(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstSize: number,
  pad: number,
  flipY = false,
): { data: Float32Array; rect: AspectFitRect } {
  const rect = aspectFitRect(srcW, srcH, dstSize);
  const data = new Float32Array(dstSize * dstSize);
  data.fill(pad);
  const { dstW, dstH, i0, j0 } = rect;
  const uMax = Math.max(1, dstW - 1);
  const vMax = Math.max(1, dstH - 1);
  for (let j = 0; j < dstH; j++) {
    const vRaw = vMax === 0 ? 0 : j / vMax;
    const v = flipY ? 1 - vRaw : vRaw;
    const row = (j0 + j) * dstSize + i0;
    for (let i = 0; i < dstW; i++) {
      const u = uMax === 0 ? 0 : i / uMax;
      data[row + i] = sampleBilinearScalar(src, srcW, srcH, u, v);
    }
  }
  return { data, rect };
}
