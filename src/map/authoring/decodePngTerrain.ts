// src/map/authoring/decodePngTerrain.ts — 8/16-bit PNG decode that keeps sample precision
import { convertIndexedToRgb, decode, hasPngSignature } from 'fast-png';

export interface DecodedPngTerrain {
  width: number;
  height: number;
  depth: 8 | 16;
  channels: number;
  /** Per-pixel samples in 0…1 (luminance for height/masks). */
  gray: Float32Array;
  /** Packed RGB 0…1, length width*height*3. Present for color / normal maps. */
  rgb: Float32Array;
}

function toUnit(value: number, maxSample: number): number {
  return maxSample <= 0 ? 0 : value / maxSample;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** PNG IHDR interlace method (0 = none, 1 = Adam7). */
function pngInterlaceMethod(bytes: Uint8Array): number {
  return bytes.length > 28 ? (bytes[28] ?? 0) : 0;
}

export function decodePngTerrain(buffer: ArrayBuffer): DecodedPngTerrain {
  const bytes = new Uint8Array(buffer);
  if (!hasPngSignature(bytes)) {
    throw new Error('Not a PNG file');
  }
  if (pngInterlaceMethod(bytes) !== 0) {
    throw new Error('Interlaced PNG is not supported — re-export without Adam7 interlace');
  }

  const png = decode(bytes);
  const { width, height, depth, channels } = png;
  if (width < 1 || height < 1 || width > 8192 || height > 8192) {
    throw new Error(`Unsupported PNG size ${width}×${height}`);
  }
  if (depth !== 8 && depth !== 16) {
    throw new Error(`Unsupported PNG bit depth ${depth} (need 8 or 16)`);
  }

  const pixelCount = width * height;
  const maxSample = (1 << depth) - 1;
  const gray = new Float32Array(pixelCount);
  const rgb = new Float32Array(pixelCount * 3);

  if (png.palette && png.palette.length > 0) {
    const expanded = convertIndexedToRgb(png);
    const srcChannels = expanded.length === pixelCount * 4 ? 4 : 3;
    for (let i = 0; i < pixelCount; i++) {
      const o = i * srcChannels;
      const r = expanded[o]! / 255;
      const g = expanded[o + 1]! / 255;
      const b = expanded[o + 2]! / 255;
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
      gray[i] = luminance(r, g, b);
    }
    return { width, height, depth: 8, channels: srcChannels, gray, rgb };
  }

  const src = png.data;
  if (channels < 1 || channels > 4) {
    throw new Error(`Unsupported PNG channel count ${channels}`);
  }

  for (let i = 0; i < pixelCount; i++) {
    const o = i * channels;
    const r = toUnit(src[o]!, maxSample);
    const g = channels > 1 ? toUnit(src[o + 1]!, maxSample) : r;
    const b = channels > 2 ? toUnit(src[o + 2]!, maxSample) : r;
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
    gray[i] = channels === 1 || channels === 2 ? r : luminance(r, g, b);
  }

  return { width, height, depth, channels, gray, rgb };
}
