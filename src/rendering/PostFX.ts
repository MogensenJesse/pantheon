// src/rendering/PostFX.ts — public PostFX API (pipeline in postfx/createPostFxPipeline.ts)
import type { DirectionalLight, PerspectiveCamera, Scene, Texture, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { AaMethod, UpscalingSettings } from '../config/visualTuning';
import type { BloomParams } from './postfx/bloomParams';
import { createPostFxPipeline, disposePostFxPipeline } from './postfx/createPostFxPipeline';
import type { DofParams } from './postfx/dofParams';
import type { GodraysParams } from './postfx/godraysParams';
import type { GpuDebugTargets } from './postfx/postfxDevDebug';

export type { AaMethod, UpscalingSettings } from '../config/visualTuning';
export type { BloomParams } from './postfx/bloomParams';
export type { DofParams } from './postfx/dofParams';
export type { GodraysParams } from './postfx/godraysParams';
export type { GpuDebugTargets };

export interface PostFxGradeScalars {
  enabled?: number;
  saturation?: number;
  contrast?: number;
  liftR?: number;
  liftG?: number;
  liftB?: number;
  warmth?: number;
  warmthTint?: string;
  lutEnabled?: number;
  lutStrength?: number;
}

export interface PostFXContext {
  render: () => void;
  getAgxExposure: () => number;
  setAgxExposure: (value: number) => void;
  getBloomParams: () => BloomParams;
  setBloomParams: (params: Partial<BloomParams>) => void;
  resetBloomParams: () => void;
  getGodraysParams: () => GodraysParams;
  setGodraysParams: (params: Partial<GodraysParams>) => void;
  resetGodraysParams: () => void;
  setDebugTargets: (targets: GpuDebugTargets) => void;
  setGodraysFromSun: (intensity: number, elevationDeg: number) => void;
  setBloomSkyReduceFromSun: (elevationDeg: number) => void;
  setGradeScalars: (scalars: PostFxGradeScalars) => void;
  setGradeLut: (texture: Texture | null, size?: number) => void;
  setDofFocus: (camera: PerspectiveCamera, focusWorld: Vector3, delta: number) => void;
  setDofBokehScale: (scale: number) => void;
  getDofParams: () => DofParams;
  setDofParams: (params: Partial<DofParams>) => void;
  resetDofParams: () => void;
  getUpscalingSettings: () => UpscalingSettings;
  setUpscalingSettings: (params: Partial<UpscalingSettings>) => void;
  getAaMethod: () => AaMethod;
  setAaMethod: (method: AaMethod) => void;
  logGpuInfo: () => void;
  /**
   * DEV: dump god-rays weight / sun-screen UV to the console.
   */
  logGodraysDiagnose: (sun: DirectionalLight) => void;
  /**
   * Startup: throwaway renders for each god-rays × bloom graph variant so dawn reconnect
   * does not hitch. Call behind the loading screen after `compileAsync`.
   */
  warmupEffectGraphs: () => void;
  /** DEV — rebuild post shader graph (DoF, FSR). */
  rebuildPostPipeline?: () => void;
}

export function initPostFX(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): PostFXContext {
  return createPostFxPipeline(renderer, scene, camera);
}

export function disposePostFX(): void {
  disposePostFxPipeline();
}
