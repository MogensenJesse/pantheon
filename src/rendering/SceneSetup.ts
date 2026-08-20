// src/rendering/SceneSetup.ts
import {
  AmbientLight,
  Color,
  DirectionalLight,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { TERRAIN_SHADOW_LAYER } from '../world/terrain/shadow/terrainShadowCast';
import { initValleyFog } from './atmosphere/valleyFog';
import { enableWaterReflectionOnCamera } from './layers/waterReflectionLayers';
import { CAMERA_FAR, SKY_BACKGROUND } from './sceneConstants';
import {
  CLOUD_SHADOW_LAYER,
  configureHardSunShadowFilter,
  createCloudCastShadowLight,
  createNearCascadeShadowLight,
  disposeCloudCastShadow,
  disposeNearCascadeShadow,
  resetFarCoverageRadiusTexels,
} from './sunShadow';

export interface SceneContext {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  ambientLight: AmbientLight;
  sun: DirectionalLight;
  /** Soft cloud-cast only — intensity 0; not used for lighting. */
  cloudCastLight: DirectionalLight;
  /** Dense near PCSS cascade — intensity 0; ground receive. */
  nearCascadeLight: DirectionalLight;
  onResize: (fn: () => void) => () => void;
}

const resizeCallbacks: Array<() => void> = [];
let activeRenderer: WebGPURenderer | null = null;
let resizeHandler: (() => void) | null = null;

export async function initSceneSetup(canvas: HTMLCanvasElement): Promise<SceneContext> {
  const scene = new Scene();
  initValleyFog(scene);

  const camera = new PerspectiveCamera(
    PHASE0.CAMERA.FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    CAMERA_FAR,
  );
  enableWaterReflectionOnCamera(camera);
  // Soft cloud casters live on CLOUD_SHADOW_LAYER only (not layer 0).
  camera.layers.enable(CLOUD_SHADOW_LAYER);

  // MSAA off — postFX uses SMAA/FXAA; renderer MSAA makes shadow/viewport TSL bindings
  // compile as multisampled while runtime textures are single-sample (WebGPU validation error).
  // DEV `trackTimestamp` requests timestamp-query so GPU pass times can be resolved each frame.
  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,
    alpha: false,
    trackTimestamp: import.meta.env.DEV,
  });
  await renderer.init();
  renderer.setClearColor(new Color(SKY_BACKGROUND), 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const { lighting } = VISUAL.shadows;
  renderer.shadowMap.enabled = true;
  activeRenderer = renderer;

  const ambient = new AmbientLight(0xe8dfc8, VISUAL.sky.lightingCurve.ambientMin);
  scene.add(ambient);

  const sun = new DirectionalLight(0xffecd0, 0);
  sun.castShadow = true;
  // Manual dirtying via updateSunShadowTarget; autoUpdate would duplicate shadow bakes.
  sun.shadow.autoUpdate = false;
  sun.shadow.mapSize.set(lighting.mapSize, lighting.mapSize);
  sun.shadow.camera.near = 1;
  // Was 500 — raised to 900 so tall peaks stay inside the shadow frustum.
  sun.shadow.camera.far = 900;
  sun.shadow.bias = lighting.shadowBias;
  sun.shadow.normalBias = lighting.shadowNormalBias;
  configureHardSunShadowFilter(renderer, sun);
  const nearCascadeLight = createNearCascadeShadowLight(scene, renderer);
  resetFarCoverageRadiusTexels();
  sun.shadow.camera.layers.enable(TERRAIN_SHADOW_LAYER);
  // Clouds use CLOUD_SHADOW_LAYER only — do not enable it on the sun shadow camera.
  scene.add(sun);
  scene.add(sun.target);

  const cloudCastLight = createCloudCastShadowLight(scene, renderer);

  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    for (const cb of resizeCallbacks) cb();
  };

  resizeHandler = handleResize;
  window.addEventListener('resize', handleResize);

  return {
    renderer,
    scene,
    camera,
    ambientLight: ambient,
    sun,
    cloudCastLight,
    nearCascadeLight,
    onResize: (fn) => {
      resizeCallbacks.push(fn);
      return () => {
        const index = resizeCallbacks.indexOf(fn);
        if (index >= 0) resizeCallbacks.splice(index, 1);
      };
    },
  };
}

export function disposeSceneSetup(): void {
  disposeNearCascadeShadow();
  disposeCloudCastShadow();
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  resizeCallbacks.length = 0;
  activeRenderer?.dispose();
  activeRenderer = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeSceneSetup();
  });
}
