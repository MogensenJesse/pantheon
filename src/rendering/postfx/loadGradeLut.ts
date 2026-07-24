// src/rendering/postfx/loadGradeLut.ts — PNG strip or .cube 3D LUT loader for post grade
import {
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import { cubeLutToStripTexture, parseCubeLut } from './parseCubeLut';

export interface GradeLutAsset {
  texture: Texture;
  size: number;
}

function configureStripTexture(texture: Texture): void {
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  // Identity-LUT check: decoding LUT texels as sRGB maps 0.5 to ~0.214, so strips are data.
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
}

async function loadCubeGradeLut(path: string, sizeHint?: number): Promise<GradeLutAsset> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading ${path}`);
  }
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') && !text.trimStart().startsWith('TITLE')) {
    throw new Error(
      `Expected .cube LUT at ${path} but got HTML — check path (vendor subfolder, e.g. /textures/grade/Sony/Name.cube)`,
    );
  }
  const parsed = parseCubeLut(text);
  if (sizeHint !== undefined && sizeHint !== parsed.size) {
    console.warn(
      `[grade] .cube LUT_3D_SIZE ${parsed.size} overrides VISUAL.postfx.grade.lut.size (${sizeHint})`,
    );
  }
  return { texture: cubeLutToStripTexture(parsed), size: parsed.size };
}

/** Load a horizontal PNG LUT strip (width = size², height = size). */
async function loadPngGradeLut(path: string, size: number): Promise<GradeLutAsset> {
  const loader = new TextureLoader();
  const texture = await loader.loadAsync(path);
  configureStripTexture(texture);
  return { texture, size };
}

/**
 * Load a grade LUT from `public/` — `.cube` (size from file) or `.png` strip (size from config).
 */
export async function loadGradeLut(path: string, sizeHint = 32): Promise<GradeLutAsset> {
  if (path.toLowerCase().endsWith('.cube')) {
    return loadCubeGradeLut(path, sizeHint);
  }
  return loadPngGradeLut(path, sizeHint);
}
