// src/rendering/PostFX.ts — public PostFX API (pipeline in postfx/createPostFxPipeline.ts)
import type { DirectionalLight, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { BloomParams } from './postfx/bloomParams';
import {
  createPostFxPipeline,
  disposePostFxPipeline,
  type GpuDebugTargets,
} from './postfx/createPostFxPipeline';
import type { DofParams } from './postfx/dofParams';
import type { GodraysParams } from './postfx/godraysParams';

export type { BloomParams } from './postfx/bloomParams';
export type { DofParams } from './postfx/dofParams';
export type { GodraysParams } from './postfx/godraysParams';
export type { GpuDebugTargets };

export interface PostFxCohesionScalars {
  bloomSceneWeightMul?: number;
  godraysWeightMul?: number;
  vignetteDarknessMul?: number;
}

export interface PostFXContext {
  render: () => void;
  setVignetteStrength: (energyRatio: number, darknessMul?: number) => void;
  disableVignette: () => void;
  getBloomParams: () => BloomParams;
  setBloomParams: (params: Partial<BloomParams>) => void;
  resetBloomParams: () => void;
  getGodraysParams: () => GodraysParams;
  setGodraysParams: (params: Partial<GodraysParams>) => void;
  resetGodraysParams: () => void;
  setDebugTargets: (targets: GpuDebugTargets) => void;
  setGodraysFromSun: (intensity: number, elevationDeg: number) => void;
  setBloomSkyReduceFromSun: (elevationDeg: number) => void;
  setCohesionScalars: (scalars: PostFxCohesionScalars) => void;
  setDofFocus: (camera: PerspectiveCamera, focusWorld: Vector3, delta: number) => void;
  setDofBokehScale: (scale: number) => void;
  getDofParams: () => DofParams;
  setDofParams: (params: Partial<DofParams>) => void;
  resetDofParams: () => void;
  logGpuInfo: () => void;
}

export function initPostFX(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
): PostFXContext {
  return createPostFxPipeline(renderer, scene, camera, sun);
}

export function disposePostFX(): void {
  disposePostFxPipeline();
}
