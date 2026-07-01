// src/rendering/SceneSetup.ts
// CHANGED: shadow frustum expanded from ±150 / far 500  →  ±220 / far 900
// to accommodate terrain sculpted up to HEIGHT_SCALE=64 (peaks ~60 m world-space).
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
import { VISUAL } from '../config/visualTuning';
import { TERRAIN_SHADOW_LAYER } from '../world/terrain/shadow/terrainShadowCast';
import { enableWaterReflectionOnCamera } from '../world/water/waterReflectionLayers';
import { initValleyFog } from './atmosphere/valleyFog';
import { CAMERA_FAR, SKY_BACKGROUND } from './sceneConstants';
import { configureSunShadowFilter } from './sunShadow/configureSunShadowFilter';

export interface SceneContext {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  ambientLight: AmbientLight;
  sun: DirectionalLight;
  onResize: (fn: () => void) => () => void;
}

const resizeCallbacks: Array<() => void> = [];
let activeRenderer: WebGPURenderer | null = null;
let resizeHandler: (() => void) | null = null;

export async function initSceneSetup(canvas: HTMLCanvasElement): Promise<SceneContext> {
  const scene = new Scene();
  initValleyFog(scene);

  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, CAMERA_FAR);
  enableWaterReflectionOnCamera(camera);

  // MSAA off — postFX uses FXAA; renderer MSAA makes shadow/viewport TSL bindings
  // compile as multisampled while runtime textures are single-sample (WebGPU validation error).
  const renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false });
  await renderer.init();
  renderer.setClearColor(new Color(SKY_BACKGROUND), 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const { lighting } = VISUAL;
  renderer.shadowMap.enabled = true;
  activeRenderer = renderer;

  const ambient = new AmbientLight(0xe8dfc8, 0.04);
  scene.add(ambient);

  const sun = new DirectionalLight(0xffecd0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lighting.mapSize, lighting.mapSize);
  sun.shadow.camera.near = 1;
  // Was 500 — raised to 900 so tall peaks stay inside the shadow frustum.
  sun.shadow.camera.far = 900;
  // Was ±150 — raised to ±220 for 4× taller terrain (HEIGHT_SCALE 64).
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.bias = lighting.shadowBias;
  sun.shadow.normalBias = lighting.shadowNormalBias;
  sun.shadow.radius = lighting.shadowSoftness;
  sun.shadow.camera.layers.enable(TERRAIN_SHADOW_LAYER);
  configureSunShadowFilter(renderer, sun, lighting.useSoftShadowMap ? 'soft' : 'vogel');
  scene.add(sun);
  scene.add(sun.target);

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
