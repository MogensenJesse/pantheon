// src/rendering/SceneSetup.ts
import {
  AmbientLight,
  DirectionalLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  NoToneMapping,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { CAMERA_FAR } from './sceneConstants';

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

  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, CAMERA_FAR);

  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Tone mapping runs in PostFX after bloom so HDR emissive values can drive glow.
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  activeRenderer = renderer;

  const ambient = new AmbientLight(0xe8dfc8, 0.04);
  scene.add(ambient);

  const sun = new DirectionalLight(0xffecd0, 0);
  sun.position.set(-40, 60, -30);
  // Shadow maps enabled after sun reveal (WorldReveal sets castShadow when intensity > 0).
  sun.castShadow = false;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
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

const SHADOW_FOLLOW_HALF = 55;

/** Keep sun + shadow ortho frustum centered on the player. */
export function updateSunShadowTarget(x: number, z: number, sun: DirectionalLight): void {
  sun.position.set(x - 40, 60, z - 30);
  sun.target.position.set(x, 0, z);
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();

  const cam = sun.shadow.camera;
  cam.left = -SHADOW_FOLLOW_HALF;
  cam.right = SHADOW_FOLLOW_HALF;
  cam.top = SHADOW_FOLLOW_HALF;
  cam.bottom = -SHADOW_FOLLOW_HALF;
  cam.updateProjectionMatrix();

  if (sun.castShadow) {
    sun.shadow.updateMatrices(sun);
    sun.shadow.needsUpdate = true;
  }
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
