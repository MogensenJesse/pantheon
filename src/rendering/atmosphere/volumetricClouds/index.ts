// src/rendering/atmosphere/volumetricClouds/index.ts — Phase 1 foundation bootstrap
import { VISUAL } from '../../../config/visualTuning';
import { type CloudNoiseTextures, loadCloudNoiseTextures } from './bake/loadCloudNoiseTextures';
import { type CloudTunables, defaultCloudTunables } from './cloudTunables';
import { initCloudVolume, updateCloudVolumeOrigin } from './cloudVolume';
import {
  type CloudDensityUniforms,
  createCloudDensityUniforms,
  createSampleCloudDensityFn,
  syncCloudDensityUniforms,
} from './tsl/cloudDensityTsl';

export { CLOUD_PERLIN_WORLEY_PATH } from './bake/loadCloudNoiseTextures';
export type { CloudTunables } from './cloudTunables';
export type { CloudAabb, CloudVolumeState } from './cloudVolume';
export {
  getCloudAabb,
  getCloudVolumeState,
  initCloudVolume,
  updateCloudVolumeOrigin,
} from './cloudVolume';
export type { CloudDensityUniforms } from './tsl/cloudDensityTsl';

export interface VolumetricCloudContext {
  noise: CloudNoiseTextures;
  densityUniforms: CloudDensityUniforms;
  /** TSL density sampler — wired into march pass in Phase 2. */
  sampleCloudDensity: ReturnType<typeof createSampleCloudDensityFn>;
  updateFrame: (elapsed: number, playerX: number, playerZ: number) => void;
  dispose: () => void;
}

let active: VolumetricCloudContext | null = null;

export function getVolumetricCloudContext(): VolumetricCloudContext | null {
  return active;
}

/** Load 3D noise, init player-follow volume, build density TSL graph. */
export async function initVolumetricClouds(
  tunables: CloudTunables = defaultCloudTunables(),
): Promise<VolumetricCloudContext | null> {
  if (!tunables.enabled) {
    return null;
  }

  const noise = await loadCloudNoiseTextures();
  if (!noise) {
    return null;
  }

  initCloudVolume(tunables);
  const densityUniforms = createCloudDensityUniforms(noise.perlinWorley);
  const sampleCloudDensity = createSampleCloudDensityFn(densityUniforms);

  const ctx: VolumetricCloudContext = {
    noise,
    densityUniforms,
    sampleCloudDensity,
    updateFrame: (elapsed, playerX, playerZ) => {
      updateCloudVolumeOrigin(playerX, playerZ);
      const wind = VISUAL.sky.volumetricClouds.windSpeed;
      syncCloudDensityUniforms(densityUniforms, tunables, playerX, playerZ, {
        x: -2 * elapsed * wind * 1.5,
        y: 0,
        z: elapsed * wind * 1.5,
      });
    },
    dispose: () => {
      noise.dispose();
      active = null;
    },
  };

  active = ctx;
  return ctx;
}

export function updateVolumetricCloudsFrame(
  elapsed: number,
  playerX: number,
  playerZ: number,
): void {
  active?.updateFrame(elapsed, playerX, playerZ);
}

export function disposeVolumetricClouds(): void {
  active?.dispose();
  active = null;
}
