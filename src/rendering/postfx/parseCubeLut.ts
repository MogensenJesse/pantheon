// src/rendering/postfx/parseCubeLut.ts — Iridas/Adobe .cube 3D LUT parser
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from 'three';

export interface ParsedCubeLut {
  size: number;
  title?: string;
  /** Interleaved RGB, length = size³ × 3. Red index varies fastest (standard .cube order). */
  data: Float32Array;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Parse LUT text from a `.cube` file (3D LUT only). */
export function parseCubeLut(text: string): ParsedCubeLut {
  const lines = text.split(/\r?\n/);
  let size = 0;
  let title: string | undefined;
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('TITLE')) {
      const quoted = line.match(/"([^"]*)"/);
      title = quoted ? quoted[1] : line.slice(5).trim();
      continue;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = Number.parseInt(parts[1] ?? '', 10);
      continue;
    }
    if (line.startsWith('LUT_1D_SIZE') || line.startsWith('DOMAIN_')) {
      continue;
    }

    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 3) continue;
    const r = Number.parseFloat(parts[0]);
    const g = Number.parseFloat(parts[1]);
    const b = Number.parseFloat(parts[2]);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) continue;
    values.push(r, g, b);
  }

  if (size <= 0) {
    throw new Error('Invalid .cube LUT: missing or invalid LUT_3D_SIZE');
  }

  const expected = size * size * size * 3;
  if (values.length < expected) {
    throw new Error(
      `Invalid .cube LUT: expected ${size ** 3} RGB triples, got ${Math.floor(values.length / 3)}`,
    );
  }

  return {
    size,
    title,
    data: new Float32Array(values.slice(0, expected)),
  };
}

/**
 * Pack a parsed 3D LUT into a horizontal 2D strip (width = size², height = size)
 * for `sampleLutStrip2D` in postGrade.ts.
 */
export function cubeLutToStripTexture(parsed: ParsedCubeLut): Texture {
  const { size, data } = parsed;
  const width = size * size;
  const height = size;
  const pixels = new Uint8Array(width * height * 4);

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const cubeIdx = (r + g * size + b * size * size) * 3;
        const stripX = b * size + r;
        const stripY = g;
        const pixIdx = (stripY * width + stripX) * 4;
        pixels[pixIdx] = Math.round(clamp01(data[cubeIdx]) * 255);
        pixels[pixIdx + 1] = Math.round(clamp01(data[cubeIdx + 1]) * 255);
        pixels[pixIdx + 2] = Math.round(clamp01(data[cubeIdx + 2]) * 255);
        pixels[pixIdx + 3] = 255;
      }
    }
  }

  const texture = new DataTexture(pixels, width, height, RGBAFormat, UnsignedByteType);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
