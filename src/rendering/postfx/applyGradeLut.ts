// src/rendering/postfx/applyGradeLut.ts — runtime grade LUT swap (DEV compare + boot load)
import type { Texture } from 'three';
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../PostFX';
import { loadGradeLut } from './loadGradeLut';

let activeLutTexture: Texture | null = null;

function disposeActiveLut(): void {
  if (activeLutTexture) {
    activeLutTexture.dispose();
    activeLutTexture = null;
  }
}

/** Load a LUT into the post pipeline; `null` clears the active LUT texture. */
export async function applyGradeLutToPostFX(
  postFX: PostFXContext,
  path: string | null,
  sizeHint = devSettings.postfx.grade.lut.size,
): Promise<void> {
  if (!path) {
    disposeActiveLut();
    postFX.setGradeLut(null);
    devSettings.postfx.grade.lut.path = null;
    return;
  }

  const asset = await loadGradeLut(path, sizeHint);
  disposeActiveLut();
  activeLutTexture = asset.texture;
  postFX.setGradeLut(asset.texture, asset.size);
  devSettings.postfx.grade.lut.path = path;
  devSettings.postfx.grade.lut.size = asset.size;
}
