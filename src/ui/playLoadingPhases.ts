// src/ui/playLoadingPhases.ts — play bootstrap lore messages and asset-batch progress
import type { Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { loadAllAssets } from '../assets/AssetLoader';
import type { AssetRegistry } from '../assets/assetManifest';
import { loadNightHdri, type NightHdriAssets } from '../rendering/sky/hdri/loadNightHdri';
import { loadTerrainTextures, type TerrainTextureSet } from '../world/terrain';
import { loadWaterNormals } from '../world/water/loadWaterNormals';
import type { PlayLoadingScreen } from './PlayLoadingScreen';

export const PLAY_LOADING_MSG = {
  renderer: 'Waking the renderer from its slumber…',
  map: 'Consulting the ancient map…',
  assets: 'Summoning trees, rocks, and assorted shrubbery…',
  earth: 'Coaxing the earth into existence…',
  stitch: 'Stitching the land together…',
  rocks: 'Telling the rocks where to stand…',
  grass: 'Negotiating with the grass…',
  light: 'Briefing the light on where to shine…',
  done: 'The world awaits. Try not to disappoint it.',
} as const;

export const PLAY_LOADING_PROGRESS = {
  renderer: 0.05,
  map: 0.1,
  assetsStart: 0.1,
  assetsEnd: 0.55,
  earthStart: 0.55,
  earthEnd: 0.7,
  stitch: 0.72,
  rocks: 0.8,
  grass: 0.92,
  light: 0.98,
  done: 1,
} as const;

const CLOSING_HOLD_MS = 500;

export interface PlayAssetBatchResult {
  assets: AssetRegistry;
  terrainTextures: TerrainTextureSet;
  waterNormals: Texture;
  nightHdri: NightHdriAssets | null;
}

export async function finishPlayLoading(screen: PlayLoadingScreen): Promise<void> {
  screen.setProgress(PLAY_LOADING_PROGRESS.done);
  screen.setMessage(PLAY_LOADING_MSG.done);
  await new Promise((resolve) => setTimeout(resolve, CLOSING_HOLD_MS));
  screen.hide();
}

export async function runPlayAssetBatch(
  screen: PlayLoadingScreen,
  renderer: WebGPURenderer,
): Promise<PlayAssetBatchResult> {
  const { assetsStart, assetsEnd, earthStart, earthEnd } = PLAY_LOADING_PROGRESS;
  const assetsSpan = assetsEnd - assetsStart;
  const earthSpan = earthEnd - earthStart;
  const earthStep = earthSpan / 3;

  screen.setMessage(PLAY_LOADING_MSG.assets);
  screen.setProgress(assetsStart);

  let earthDone = 0;
  let earthMessageSet = false;

  const onEarthTaskDone = () => {
    earthDone++;
    if (!earthMessageSet) {
      earthMessageSet = true;
      screen.setMessage(PLAY_LOADING_MSG.earth);
    }
    screen.setProgress(earthStart + earthStep * earthDone);
  };

  const assetsPromise = loadAllAssets((loaded, total) => {
    const t = total > 0 ? loaded / total : 1;
    screen.setProgress(assetsStart + assetsSpan * t);
  }).then((assets) => {
    screen.setProgress(assetsEnd);
    if (!earthMessageSet) {
      earthMessageSet = true;
      screen.setMessage(PLAY_LOADING_MSG.earth);
    }
    return assets;
  });

  const [assets, terrainTextures, waterNormals, nightHdri] = await Promise.all([
    assetsPromise,
    loadTerrainTextures().then((tex) => {
      onEarthTaskDone();
      return tex;
    }),
    loadWaterNormals().then((tex) => {
      onEarthTaskDone();
      return tex;
    }),
    loadNightHdri(renderer)
      .catch((err) => {
        console.error('Night HDRI load failed:', err);
        return null;
      })
      .then((hdri) => {
        onEarthTaskDone();
        return hdri;
      }),
  ]);

  screen.setProgress(earthEnd);
  return { assets, terrainTextures, waterNormals, nightHdri };
}
