// src/optimizer/pipeline/readbackRgba8.ts — strip WebGPU row-pitch padding after RT readback

import { ClampToEdgeWrapping, DataTexture, NoColorSpace, type RenderTarget } from 'three';
import {
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type WebGPURenderer,
} from 'three/webgpu';

const ALIGN = 256;

export function stripRowPitch(
  buffer: ArrayBufferView,
  width: number,
  height: number,
  bytesPerPixel = 4,
): Uint8Array {
  const src =
    buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const packed = width * bytesPerPixel;
  if (src.byteLength === packed * height) return new Uint8Array(src);
  const rowStride = Math.ceil(packed / ALIGN) * ALIGN;
  const out = new Uint8Array(packed * height);
  for (let y = 0; y < height; y++) {
    out.set(src.subarray(y * rowStride, y * rowStride + packed), y * packed);
  }
  return out;
}

export async function readRgba8(
  renderer: WebGPURenderer,
  target: RenderTarget,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const raw = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
  return stripRowPitch(raw as ArrayBufferView, width, height);
}

export function rgbaToDataTexture(
  data: Uint8Array,
  width: number,
  height: number,
  opts?: { srgb?: boolean; name?: string },
): DataTexture {
  const tex = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  tex.needsUpdate = true;
  tex.flipY = false;
  // WebGPU DataTextures do not get CPU mip chains; LinearMipmapLinearFilter samples garbage.
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = opts?.srgb ? SRGBColorSpace : NoColorSpace;
  tex.name = opts?.name ?? 'optimizer-bake';
  return tex;
}
