// src/rendering/PostFX.ts — WebGPU PostProcessing + scene-output bloom
import {
  Vector2,
  type DirectionalLight,
  type InstancedMesh,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { PostProcessing, type WebGPURenderer } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
  Fn,
  acesFilmicToneMapping,
  mix,
  pass,
  screenUV,
  uniform,
  vec4,
} from 'three/tsl';
import { PHASE0 } from '../config/phase0';
import { devSettings } from '../core/GameState';
import { logGpuSnapshot, maybeLogGpuPeriodic } from './gpuDebugLog';
import { applyEdgeAa } from './postfx/edgeAaEffect';
import { pixelatedUv } from './postfx/pixelateEffect';
import { applyQuantize } from './postfx/quantizeEffect';
import { applyVignette } from './postfx/vignetteEffect';

const { BLOOM, RENDER } = PHASE0;

/** Dev-tunable bloom (see phase0.ts for fixed threshold / HDR constants). */
export interface BloomParams {
  emissiveStrength: number;
  radius: number;
  sceneStrengthMul: number;
  exposure: number;
}

export interface GpuDebugTargets {
  scene: Scene;
  terrainMesh: Mesh;
  water: Mesh;
  clouds: Object3D;
  sky: Object3D;
  scatterMeshes: InstancedMesh[];
  sun: DirectionalLight;
}

/** @deprecated Use GpuDebugTargets */
export type PostFXDebugTargets = GpuDebugTargets;

export interface PostFXContext {
  render: () => void;
  resize: (width: number, height: number) => void;
  setVignetteStrength: (energyRatio: number) => void;
  disableVignette: () => void;
  setPixelSize: (size: number) => void;
  setColorLevels: (levels: number) => void;
  setRenderQuality: (high: boolean) => void;
  getBloomParams: () => BloomParams;
  setBloomParams: (params: Partial<BloomParams>) => void;
  resetBloomParams: () => void;
  setDebugTargets: (targets: GpuDebugTargets) => void;
  logGpuInfo: () => void;
}

function defaultBloomParams(): BloomParams {
  return {
    emissiveStrength: BLOOM.STRENGTH,
    radius: BLOOM.RADIUS,
    sceneStrengthMul: BLOOM.SCENE_STRENGTH_MUL,
    exposure: RENDER.TONE_MAPPING_EXPOSURE as number,
  };
}

export function initPostFX(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): PostFXContext {
  const scenePass = pass(scene, camera);
  // Single color target only — MRT (output + emissive) breaks WebGPU on Chromium when
  // classic/GLTF materials lack a second fragment output (scatter grass, water, etc.).
  const sceneColor = scenePass.getTextureNode('output');

  const bloomScene = bloom(
    sceneColor,
    BLOOM.STRENGTH * BLOOM.SCENE_STRENGTH_MUL,
    BLOOM.RADIUS,
    BLOOM.SCENE_THRESHOLD,
  );
  bloomScene.smoothWidth.value = BLOOM.SMOOTH_WIDTH;

  const uExposure = uniform(Number(RENDER.TONE_MAPPING_EXPOSURE));
  const uPixelSize = uniform(1);
  const uColorLevels = uniform(1);
  const uResolution = uniform(new Vector2(window.innerWidth, window.innerHeight));
  const uVignetteInner = uniform(0.3);
  const uVignetteDarkness = uniform(0.95);
  const uVignetteEnabled = uniform(1);
  const uSceneBloomWeight = uniform(1);
  const uEdgeAaEnabled = uniform(1);

  let debugTargets: GpuDebugTargets | null = null;
  let bloomLogOnce = false;
  let bloomParams = defaultBloomParams();

  const applyBloomParams = (params: Partial<BloomParams>) => {
    bloomParams = { ...bloomParams, ...params };
    bloomScene.strength.value = bloomParams.emissiveStrength * bloomParams.sceneStrengthMul;
    bloomScene.radius.value = bloomParams.radius;
    uExposure.value = bloomParams.exposure;
  };

  const composite = Fn(() => {
    const uv = screenUV;
    const { sampleUv } = pixelatedUv(uv, uPixelSize, uResolution);

    const baseSample = sceneColor.sample(sampleUv);
    const bloomAdd = bloomScene.mul(uSceneBloomWeight);
    const bloomed = baseSample.rgb.add(bloomAdd);

    let color = acesFilmicToneMapping(bloomed, uExposure);
    color = applyQuantize(color, uColorLevels);
    const withEdgeAa = applyEdgeAa(sceneColor, uv, color, uResolution);
    color = mix(color, withEdgeAa, uEdgeAaEnabled);
    color = applyVignette(color, uv, uVignetteInner, uVignetteDarkness, uVignetteEnabled);

    return vec4(color, baseSample.a);
  });

  const postProcessing = new PostProcessing(renderer, composite());

  const applyGpuDebug = () => {
    const d = devSettings.renderDebug;

    uSceneBloomWeight.value = d.disableBloom ? 0 : 1;
    uEdgeAaEnabled.value = d.disableEdgeAa ? 0 : 1;

    if (debugTargets) {
      debugTargets.terrainMesh.visible = !d.hideTerrain;
      debugTargets.water.visible = !d.hideWater;
      debugTargets.clouds.visible = !d.hideClouds;
      debugTargets.sky.visible = !d.hideSky;
      for (const mesh of debugTargets.scatterMeshes) {
        mesh.visible = !d.hideScatter;
      }
      const shadowsAllowed =
        !d.disableShadows && debugTargets.sun.intensity > 0;
      debugTargets.sun.castShadow = shadowsAllowed;
    }
  };

  return {
    render: () => {
      applyGpuDebug();

      if (import.meta.env.DEV && !bloomLogOnce) {
        bloomLogOnce = true;
        console.info('[RenderDebug] postFX', {
          bloomSource: 'scene output (single RT)',
          mrt: false,
          strength: bloomScene.strength.value,
          radius: bloomScene.radius.value,
        });
      }
      postProcessing.render();
      maybeLogGpuPeriodic(renderer, devSettings.renderDebug);
    },
    resize: (width, height) => {
      uResolution.value.set(width, height);
    },
    setVignetteStrength: (energyRatio: number) => {
      uVignetteInner.value = 0.3 + energyRatio * 0.55;
      uVignetteDarkness.value = 0.95 - energyRatio * 0.55;
    },
    disableVignette: () => {
      uVignetteEnabled.value = 0;
    },
    setPixelSize: (size: number) => {
      uPixelSize.value = Math.max(1, size);
    },
    setColorLevels: (levels: number) => {
      uColorLevels.value = Math.max(1, levels);
    },
    setRenderQuality: (high: boolean) => {
      // Full-res scene always — half-res scenePass made terrain/grass look soft (upscaled).
      scenePass.setResolution(BLOOM.RESOLUTION_SCALE_HIGH);
      applyBloomParams({
        emissiveStrength: high ? BLOOM.STRENGTH_HIGH : BLOOM.STRENGTH,
        radius: high ? BLOOM.RADIUS_HIGH : BLOOM.RADIUS,
      });
    },
    getBloomParams: () => ({ ...bloomParams }),
    setBloomParams: applyBloomParams,
    resetBloomParams: () => applyBloomParams(defaultBloomParams()),
    setDebugTargets: (targets) => {
      debugTargets = targets;
      applyGpuDebug();
    },
    logGpuInfo: () => {
      logGpuSnapshot(renderer, devSettings.renderDebug, true);
    },
  };
}

export function disposePostFX(): void {
  /* PostProcessing releases with renderer teardown */
}
