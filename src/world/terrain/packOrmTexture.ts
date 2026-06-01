// src/world/terrain/packOrmTexture.ts — pack roughness/AO/metalness into one RGB texture (saves sampler units)
import { DataTexture, NoColorSpace, RepeatWrapping, type Texture } from 'three';

function configurePacked(texture: DataTexture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
}

function readGrayChannel(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  width: number,
  height: number,
): Uint8ClampedArray {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function asImage(tex: Texture): HTMLImageElement | null {
  const img = tex.image;
  if (img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0) {
    return img;
  }
  return null;
}

/** R = roughness, G = AO, B = metalness (optional). Disposes source maps after packing. */
export function packOrmTexture(rough: Texture, ao: Texture, metal?: Texture): DataTexture {
  const roughImg = asImage(rough);
  const aoImg = asImage(ao);
  const width = roughImg?.naturalWidth ?? aoImg?.naturalWidth ?? 1;
  const height = roughImg?.naturalHeight ?? aoImg?.naturalHeight ?? 1;

  if (!roughImg || !aoImg || width < 2 || height < 2) {
    rough.dispose();
    ao.dispose();
    metal?.dispose();
    const tex = new DataTexture(new Uint8Array([128, 255, 0, 255]), 1, 1);
    configurePacked(tex);
    return tex;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    rough.dispose();
    ao.dispose();
    metal?.dispose();
    const tex = new DataTexture(new Uint8Array([128, 255, 0, 255]), 1, 1);
    configurePacked(tex);
    return tex;
  }

  const roughData = readGrayChannel(ctx, roughImg, width, height);
  const aoData = readGrayChannel(ctx, aoImg, width, height);
  const metalImg = metal ? asImage(metal) : null;
  const metalData = metalImg ? readGrayChannel(ctx, metalImg, width, height) : null;

  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const i4 = i * 4;
    pixels[i4] = roughData[i4];
    pixels[i4 + 1] = aoData[i4];
    pixels[i4 + 2] = metalData ? metalData[i4] : 0;
    pixels[i4 + 3] = 255;
  }

  rough.dispose();
  ao.dispose();
  metal?.dispose();

  const tex = new DataTexture(pixels, width, height);
  configurePacked(tex);
  return tex;
}
