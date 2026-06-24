// src/rendering/SceneSetup.ts
// CHANGED: shadow frustum expanded from ±150 / far 500  →  ±220 / far 900
// to accommodate terrain sculpted up to HEIGHT_SCALE=64 (peaks ~60 m world-space).
import {
  AmbientLight,
  DirectionalLight,
  NoToneMapping,
  PCFShadowMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../config/visualTuning';
import { TERRAIN_SHADOW_LAYER } from '../world/terrain/shadow/terrainShadowCast';
import { enableWaterReflectionOnCamera } from '../world/water/waterReflectionLayers';
import { CAMERA_FAR } from './sceneConstants';
import { sunDevState } from './sunDevState';
import { currentSunAzimuthDeg, currentSunElevationDeg, sunDirectionFromSpherical } from './sunSpherical';

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
const _sunDir = new Vector3();

export async function initSceneSetup(canvas: HTMLCanvasElement): Promise<SceneContext> {
  const scene = new Scene();

  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, CAMERA_FAR);
  enableWaterReflectionOnCamera(camera);

  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const { lighting } = VISUAL;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lighting.useSoftShadowMap ? PCFSoftShadowMap : PCFShadowMap;
  activeRenderer = renderer;

  const ambient = new AmbientLight(0xe8dfc8, 0.04);
  scene.add(ambient);

  const sun = new DirectionalLight(0xffecd0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
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

// Was SHADOW_FOLLOW_HALF = 100 — increased to match the wider shadow frustum.
const SHADOW_FOLLOW_HALF = 160;

/**
 * Place sun using webgpu_sky.html spherical elevation/azimuth (degrees above horizon).
 */
export function updateSunShadowTarget(
  x: number,
  z: number,
  sun: DirectionalLight,
  elevationDeg = currentSunElevationDeg(),
): void {
  sunDirectionFromSpherical(elevationDeg, currentSunAzimuthDeg(), _sunDir);
  sun.target.position.set(x, 0, z);
  sun.position.copy(sun.target.position).addScaledVector(_sunDir, sunDevState.lightDistance);
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

/**
 * Allocate sun.shadow.map before postFX / compileAsync so GodraysNode and shadow()
 * receivers can sample depth without TSL texture() errors on the first frames.
 */
export function warmupSunShadowMap(
  renderer: WebGPURenderer,
  scene: Scene,
  sun: DirectionalLight,
  camera: PerspectiveCamera,
  focusX: number,
  focusZ: number,
): void {
  if (!sun.castShadow || !renderer.shadowMap.enabled) return;

  updateSunShadowTarget(focusX, focusZ, sun);
  renderer.render(scene, camera);
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