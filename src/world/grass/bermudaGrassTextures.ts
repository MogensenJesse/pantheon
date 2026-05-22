// src/world/grass/bermudaGrassTextures.ts — Poly Haven grass_bermuda_01 maps (CC0)
// Phase 2: runtime impostor atlas from GLTF — not loaded in Grass System v2.
import {
  DataTexture,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  UnsignedByteType,
} from 'three';

export const BERMUDA_GRASS_TEXTURE_BASE = '/textures/grass/';

const EXTENSIONS = ['jpg', 'png', 'webp'] as const;

export interface BermudaGrassTextureSet {
  color: Texture;
  alpha: Texture;
}

function configureColor(texture: Texture): void {
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}

function configureAlpha(texture: Texture): void {
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
}

function fallbackColor(): DataTexture {
  const data = new Uint8Array([42, 85, 32, 255]);
  const tex = new DataTexture(data, 1, 1, undefined, UnsignedByteType);
  configureColor(tex);
  return tex;
}

function fallbackAlpha(): DataTexture {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new DataTexture(data, 1, 1, undefined, UnsignedByteType);
  configureAlpha(tex);
  return tex;
}

async function loadMap(
  loader: TextureLoader,
  basename: 'bermuda_diffuse' | 'bermuda_alpha',
  kind: 'color' | 'alpha',
): Promise<Texture> {
  const tried: string[] = [];
  for (const ext of EXTENSIONS) {
    const url = `${BERMUDA_GRASS_TEXTURE_BASE}${basename}.${ext}`;
    tried.push(url);
    try {
      const texture = await loader.loadAsync(url);
      if (kind === 'color') configureColor(texture);
      else configureAlpha(texture);
      return texture;
    } catch {
      // try next extension
    }
  }
  console.warn(`[grass] Missing ${basename}. Tried:\n  ${tried.join('\n  ')}`);
  return kind === 'color' ? fallbackColor() : fallbackAlpha();
}

export async function loadBermudaGrassTextures(): Promise<BermudaGrassTextureSet> {
  const loader = new TextureLoader();
  const [color, alpha] = await Promise.all([
    loadMap(loader, 'bermuda_diffuse', 'color'),
    loadMap(loader, 'bermuda_alpha', 'alpha'),
  ]);
  if (import.meta.env.DEV) {
    console.info('[grass] Bermuda blade textures loaded', {
      color: color.image?.width,
      alpha: alpha.image?.width,
      credit: 'grass_bermuda_01 by Poly Haven (CC0)',
    });
  }
  return { color, alpha };
}
