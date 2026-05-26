// src/rendering/SkySystem.ts — HDRI background + billboard cloud sprites (WebGPU)
import {
  Color,
  DirectionalLight,
  Object3D,
  Scene,
  Vector3,
  type PerspectiveCamera,
  type Texture,
} from 'three';
import { equirectUV, texture, uniform } from 'three/tsl';
import { createCloudSystem } from './CloudSystem';
import { logRenderDebugSky } from './renderDebugLog';
import { SKY_BACKGROUND } from './sceneConstants';

export { CAMERA_FAR, SKY_BACKGROUND, SKY_SCALE } from './sceneConstants';

const _sunDir = new Vector3();

/** Dev panel hide-sky toggles HDRI background intensity (Object3D.visible duck-type). */
export type SkyBackgroundHandle = { visible: boolean };

export interface SkySystemContext {
  sky: SkyBackgroundHandle;
  clouds: Object3D;
  update: (sun: DirectionalLight, camera: PerspectiveCamera, elapsed: number) => void;
  setDaylight: (factor: number) => void;
  syncCloudDev: () => void;
  dispose: () => void;
}

export function initSkySystem(
  scene: Scene,
  hdriTexture: Texture,
  cloudTexture: Texture,
): SkySystemContext {
  scene.background = new Color(SKY_BACKGROUND);

  const uSkyIntensity = uniform(0);
  const cloudSystem = createCloudSystem(cloudTexture);

  scene.backgroundNode = texture(hdriTexture, equirectUV(), 0).rgb.mul(uSkyIntensity);
  scene.add(cloudSystem.group);

  let daylight = 0.12;
  let skyBackgroundVisible = true;
  let debugSkyLogged = false;

  const applyDaylight = () => {
    const intensity = skyBackgroundVisible ? Math.pow(daylight, 1.5) : 0;
    uSkyIntensity.value = intensity;
  };

  const sky: SkyBackgroundHandle = {
    get visible() {
      return skyBackgroundVisible;
    },
    set visible(value: boolean) {
      skyBackgroundVisible = value;
      applyDaylight();
    },
  };

  const syncSunPosition = (sun: DirectionalLight) => {
    _sunDir.copy(sun.position).sub(sun.target.position).normalize();
  };

  applyDaylight();

  return {
    sky,
    clouds: cloudSystem.group,
    update(sun, camera, elapsed) {
      syncSunPosition(sun);
      if (import.meta.env.DEV) cloudSystem.syncDevSettings();
      cloudSystem.update(elapsed, _sunDir, camera.position, daylight);
      if (import.meta.env.DEV && !debugSkyLogged) {
        debugSkyLogged = true;
        logRenderDebugSky(cloudSystem.group, sun, daylight);
      }
    },
    setDaylight(factor) {
      daylight = Math.max(0, Math.min(1, factor));
      applyDaylight();
    },
    syncCloudDev() {
      cloudSystem.syncDevSettings();
    },
    dispose() {
      scene.backgroundNode = null;
      scene.remove(cloudSystem.group);
      cloudSystem.dispose();
      hdriTexture.dispose();
      cloudTexture.dispose();
    },
  };
}
