// src/world/terrain/packOrmTexture.ts — pack roughness/AO/metalness into one RGB texture (saves sampler units)
import { DataTexture, NoColorSpace, RepeatWrapping, type Texture } from 'three';
import { TerrainPackLoadError } from './terrainLoadErrors';

function configurePacked(texture: DataTexture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
}

function asImage(tex: Texture): HTMLImageElement | null {
  const img = tex.image;
  if (img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0) {
    return img;
  }
  return null;
}

function readImageRgba(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  width: number,
  height: number,
): Uint8ClampedArray | null {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function failOrmPack(reason: string): never {
  throw new TerrainPackLoadError(`Terrain ORM pack failed: ${reason}`);
}

function packChannelsToOrm(
  mr: Texture,
  remap: (data: Uint8ClampedArray, i: number) => [number, number, number],
): DataTexture {
  const img = asImage(mr);
  const width = img?.naturalWidth ?? 0;
  const height = img?.naturalHeight ?? 0;

  if (!img || width < 2 || height < 2) {
    mr.dispose();
    failOrmPack('metallicRoughness image missing or too small');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    mr.dispose();
    failOrmPack('2d canvas unavailable');
  }

  const rgba = readImageRgba(ctx, img, width, height);
  if (!rgba) {
    mr.dispose();
    failOrmPack('could not read metallicRoughness pixels');
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const i4 = i * 4;
    const [r, g, b] = remap(rgba, i4);
    pixels[i4] = r;
    pixels[i4 + 1] = g;
    pixels[i4 + 2] = b;
    pixels[i4 + 3] = 255;
  }

  mr.dispose();
  const tex = new DataTexture(pixels, width, height);
  configurePacked(tex);
  return tex;
}

/** Poly Haven rough-only MR: G = roughness → R=rough, G=AO(1), B=metal(0). */
export function packRoughMrToOrm(mr: Texture): DataTexture {
  return packChannelsToOrm(mr, (data, i4) => [data[i4 + 1], 255, 0]);
}

/** Poly Haven ARM: R=AO, G=rough, B=metal → our ORM R=rough, G=AO, B=metal. */
export function packArmToOrm(arm: Texture): DataTexture {
  return packChannelsToOrm(arm, (data, i4) => [data[i4 + 1], data[i4], data[i4 + 2]]);
}
