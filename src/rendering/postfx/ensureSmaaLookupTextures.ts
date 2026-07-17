// src/rendering/postfx/ensureSmaaLookupTextures.ts
// SMAA area/search LUTs must be raw UNORM index tables. Prefer ImageBitmap with
// colorSpaceConversion:'none' — canvas drawImage can crush the sparse search LUT.
// ImageData is NOT supported by WebGPU copyExternalImageToTexture (uploads black).
import type SMAANode from 'three/addons/tsl/display/SMAANode.js';
import { NoColorSpace, type Texture, type WebGPURenderer } from 'three/webgpu';

type SmaaLutInternals = {
  _areaTexture?: Texture;
  _searchTexture?: Texture;
};

const _canvasPrepared = new WeakSet<Texture>();
const _bitmapPrepared = new WeakSet<Texture>();
const _bitmapPending = new WeakSet<Texture>();
const _lutSource = new WeakMap<Texture, HTMLImageElement | ImageBitmap>();

function sourceSize(image: HTMLImageElement | ImageBitmap | HTMLCanvasElement): {
  width: number;
  height: number;
} {
  return { width: image.width, height: image.height };
}

/** Sync interim upload source; replaced by raw ImageBitmap when ready. */
function rasterizeToCanvas(image: HTMLImageElement | ImageBitmap): HTMLCanvasElement | null {
  const { width, height } = sourceSize(image);
  if (width < 1 || height < 1) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
  return canvas;
}

function finishUpload(tex: Texture, renderer?: WebGPURenderer): void {
  tex.needsUpdate = true;
  try {
    renderer?.initTexture(tex);
  } catch {
    // Renderer may not be ready on first call; first draw will upload.
  }
}

function requestRawBitmap(
  tex: Texture,
  image: HTMLImageElement | ImageBitmap,
  renderer?: WebGPURenderer,
): void {
  if (_bitmapPrepared.has(tex) || _bitmapPending.has(tex)) return;
  if (typeof createImageBitmap !== 'function') return;

  _bitmapPending.add(tex);
  void createImageBitmap(image, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  } as ImageBitmapOptions)
    .then((bitmap) => {
      tex.image = bitmap;
      _bitmapPrepared.add(tex);
      _bitmapPending.delete(tex);
      finishUpload(tex, renderer);
    })
    .catch(() => {
      _bitmapPending.delete(tex);
    });
}

function markLutReady(tex: Texture | undefined, renderer?: WebGPURenderer): void {
  if (!tex) return;

  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.premultiplyAlpha = false;

  const image = tex.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement | null | undefined;
  if (!image) return;

  if (
    typeof ImageBitmap !== 'undefined' &&
    image instanceof ImageBitmap &&
    _bitmapPrepared.has(tex)
  ) {
    finishUpload(tex, renderer);
    return;
  }

  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    const src = _lutSource.get(tex);
    if (src) requestRawBitmap(tex, src, renderer);
    finishUpload(tex, renderer);
    return;
  }

  const isBitmap = typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
  const complete = isBitmap ? true : Boolean((image as HTMLImageElement).complete);
  if (!complete) {
    if (typeof (image as HTMLImageElement).addEventListener === 'function') {
      (image as HTMLImageElement).addEventListener(
        'load',
        () => {
          markLutReady(tex, renderer);
        },
        { once: true },
      );
    }
    return;
  }

  const src = image as HTMLImageElement | ImageBitmap;
  _lutSource.set(tex, src);
  requestRawBitmap(tex, src, renderer);

  if (!_canvasPrepared.has(tex) && !_bitmapPrepared.has(tex)) {
    const canvas = rasterizeToCanvas(src);
    if (canvas) {
      tex.image = canvas;
      _canvasPrepared.add(tex);
      finishUpload(tex, renderer);
    }
  } else {
    finishUpload(tex, renderer);
  }
}

/** Force SMAA area/search LUT GPU upload (WebGPU-safe canvas interim → raw ImageBitmap). */
export function ensureSmaaLookupTextures(node: SMAANode, renderer?: WebGPURenderer): void {
  const internals = node as unknown as SmaaLutInternals;
  markLutReady(internals._areaTexture, renderer);
  markLutReady(internals._searchTexture, renderer);
}
