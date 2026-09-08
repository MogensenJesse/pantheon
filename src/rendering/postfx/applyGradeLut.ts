// src/rendering/postfx/applyGradeLut.ts — runtime grade LUT swap (DEV compare + boot load)
import type { Texture } from 'three';
import type { TodStopId } from '../../config/visual/tod';
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../PostFX';
import { currentSunElevationDeg } from '../sunSpherical';
import { dominantTodStop } from '../tod/todBlend';
import { loadGradeLut } from './loadGradeLut';

let activeLutTexture: Texture | null = null;

function disposeActiveLut(): void {
  if (activeLutTexture) {
    activeLutTexture.dispose();
    activeLutTexture = null;
  }
}

function resolveLutStop(stop?: TodStopId): TodStopId {
  return stop ?? dominantTodStop(currentSunElevationDeg());
}

/** Load a LUT into the post pipeline; `null` clears the active LUT texture. */
export async function applyGradeLutToPostFX(
  postFX: PostFXContext,
  path: string | null,
  sizeHint?: number,
  stop?: TodStopId,
): Promise<void> {
  const lutStop = resolveLutStop(stop);
  const lut = devSettings.postfx.grade.stops[lutStop].lut;
  const hint = sizeHint ?? lut.size;

  if (!path) {
    disposeActiveLut();
    postFX.setGradeLut(null);
    lut.path = null;
    return;
  }

  const asset = await loadGradeLut(path, hint);
  disposeActiveLut();
  activeLutTexture = asset.texture;
  postFX.setGradeLut(asset.texture, asset.size);
  lut.path = path;
  lut.size = asset.size;
}
