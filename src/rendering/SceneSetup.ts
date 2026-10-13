// src/rendering/SceneSetup.ts
import {
  AmbientLight,
  Color,
  DirectionalLight,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { initValleyFog } from './atmosphere';
import { enableWaterReflectionOnCamera } from './layers/waterReflectionLayers';
import { CAMERA_FAR, SKY_BACKGROUND } from './sceneConstants';
import {
  CLOUD_SHADOW_LAYER,
  configureFarSunShadowFilter,
  createCloudCastShadowLight,
  createNearCascadeShadowLight,
  disposeCloudCastShadow,
  disposeNearCascadeShadow,
  disposeWorldCascadeShadow,
  SHADOW_CAMERA_EXPLICIT_LAYER,
  SHADOW_CAMERA_FAR_M,
  setFragmentTextureBudget,
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

export interface SceneSetupOptions {
  /** Size the drawing buffer from the canvas layout box and skip window resize. */
  fitCanvas?: boolean;
}

const resizeCallbacks: Array<() => void> = [];
let activeRenderer: WebGPURenderer | null = null;
let resizeHandler: (() => void) | null = null;

/** Adapter max sampled textures / samplers per stage (falls back to WebGPU defaults). */
async function queryShaderStageTextureLimits(): Promise<Record<string, number>> {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return {};
    return {
      maxSampledTexturesPerShaderStage: adapter.limits.maxSampledTexturesPerShaderStage,
      maxSamplersPerShaderStage: adapter.limits.maxSamplersPerShaderStage,
    };
  } catch {
    return {};
  }
}

export async function initSceneSetup(
  canvas: HTMLCanvasElement,
  options?: SceneSetupOptions,
): Promise<SceneContext> {
  const scene = new Scene();
  scene.name = 'world';
  initValleyFog(scene);

  const layoutW = Math.max(1, canvas.clientWidth || window.innerWidth);
  const layoutH = Math.max(1, canvas.clientHeight || window.innerHeight);
  const initialW = options?.fitCanvas ? layoutW : window.innerWidth;
  const initialH = options?.fitCanvas ? layoutH : window.innerHeight;

  const camera = new PerspectiveCamera(PHASE0.CAMERA.FOV, initialW / initialH, 0.1, CAMERA_FAR);
  enableWaterReflectionOnCamera(camera);
  // Soft cloud casters live on CLOUD_SHADOW_LAYER only (not layer 0).
  camera.layers.enable(CLOUD_SHADOW_LAYER);

  // MSAA off: postFX handles AA, and renderer MSAA makes shadow/viewport TSL bindings compile as
  // multisampled while runtime textures are single-sample (WebGPU validation error).
  // DEV `trackTimestamp` requests timestamp-query so GPU pass times can be resolved each frame.
  // Terrain sits at the default 16 sampled textures per fragment stage: request the adapter's real
  // maximum so the world visibility texture fits. Receivers check the granted budget.
  const textureLimits = await queryShaderStageTextureLimits();
  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,
    alpha: false,
    trackTimestamp: import.meta.env.DEV,
    requiredLimits: textureLimits,
  });
  await renderer.init();
  setFragmentTextureBudget(textureLimits.maxSampledTexturesPerShaderStage);
  renderer.setClearColor(new Color(SKY_BACKGROUND), 1);
  renderer.setSize(initialW, initialH, options?.fitCanvas ? false : undefined);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const { lighting } = VISUAL.shadows;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  activeRenderer = renderer;

  const ambient = new AmbientLight(0xe8dfc8, VISUAL.sky.lighting.night.ambientIntensity);
  scene.add(ambient);

  const sun = new DirectionalLight(0xffecd0, 0);
  sun.name = 'sun';
  sun.castShadow = true;
  // Manual dirtying via updateFarSunShadowTarget; autoUpdate would duplicate shadow bakes.
  sun.shadow.autoUpdate = false;
  sun.shadow.mapSize.set(lighting.mapSize, lighting.mapSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = SHADOW_CAMERA_FAR_M;
  sun.shadow.bias = lighting.shadowBias;
  sun.shadow.normalBias = lighting.shadowNormalBias;
  // Explicit mask: otherwise Three copies the main camera's, which includes CLOUD_SHADOW_LAYER.
  sun.shadow.camera.layers.enable(SHADOW_CAMERA_EXPLICIT_LAYER);
  configureFarSunShadowFilter(sun);
  const nearCascadeLight = createNearCascadeShadowLight(scene);
  scene.add(sun);
  scene.add(sun.target);

  const cloudCastLight = createCloudCastShadowLight(scene);

  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    for (const cb of resizeCallbacks) cb();
  };

  if (!options?.fitCanvas) {
    resizeHandler = handleResize;
    window.addEventListener('resize', handleResize);
  }

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
  disposeWorldCascadeShadow();
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
