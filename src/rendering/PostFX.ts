// src/rendering/PostFX.ts — WebGPU PostProcessing + selective emissive bloom (WebGL-style glow)
import { Vector2, type Mesh, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import { PostProcessing, type WebGPURenderer } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
  Fn,
  acesFilmicToneMapping,
  emissive,
  mrt,
  output,
  pass,
  screenUV,
  uniform,
  vec4,
} from 'three/tsl';
import { PHASE0 } from '../config/phase0';
import { devSettings } from '../core/GameState';
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

export interface PostFXDebugTargets {
  scene: Scene;
  terrainMesh: Mesh;
  clouds: Object3D;
}

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
  setDebugTargets: (targets: PostFXDebugTargets) => void;
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
  scenePass.setMRT(mrt({ output, emissive }));

  const sceneColor = scenePass.getTextureNode('output');
  const emissivePass = scenePass.getTextureNode('emissive');

  const bloomEmissive = bloom(
    emissivePass,
    BLOOM.STRENGTH,
    BLOOM.RADIUS,
    BLOOM.THRESHOLD,
  );
  bloomEmissive.smoothWidth.value = BLOOM.SMOOTH_WIDTH;

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

  let debugTargets: PostFXDebugTargets | null = null;
  let bloomLogOnce = false;
  let bloomParams = defaultBloomParams();

  const applyBloomParams = (params: Partial<BloomParams>) => {
    bloomParams = { ...bloomParams, ...params };
    bloomEmissive.strength.value = bloomParams.emissiveStrength;
    bloomEmissive.radius.value = bloomParams.radius;
    bloomScene.strength.value = bloomParams.emissiveStrength * bloomParams.sceneStrengthMul;
    bloomScene.radius.value = bloomParams.radius;
    uExposure.value = bloomParams.exposure;
  };

  const composite = Fn(() => {
    const uv = screenUV;
    const { sampleUv } = pixelatedUv(uv, uPixelSize, uResolution);

    const baseSample = sceneColor.sample(sampleUv);
    const bloomed = baseSample.rgb.add(bloomEmissive).add(bloomScene);

    let color = acesFilmicToneMapping(bloomed, uExposure);
    color = applyQuantize(color, uColorLevels);
    color = applyEdgeAa(sceneColor, uv, color, uResolution);
    color = applyVignette(color, uv, uVignetteInner, uVignetteDarkness, uVignetteEnabled);

    return vec4(color, baseSample.a);
  });

  const postProcessing = new PostProcessing(renderer, composite());

  const applyDebugVisibility = () => {
    if (!debugTargets) return;
    const d = devSettings.renderDebug;
    debugTargets.terrainMesh.visible = !d.hideTerrain;
    debugTargets.clouds.visible = !d.hideClouds;
  };

  return {
    render: () => {
      applyDebugVisibility();
      if (import.meta.env.DEV && !bloomLogOnce) {
        bloomLogOnce = true;
        console.info('[RenderDebug] postFX', {
          bloomSource: 'MRT emissive + scene output (high threshold)',
          mrt: true,
          strength: bloomEmissive.strength.value,
          sceneStrength: bloomScene.strength.value,
          radius: bloomEmissive.radius.value,
        });
      }
      postProcessing.render();
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
      applyDebugVisibility();
    },
    logGpuInfo: () => {
      const info = renderer.info;
      console.info('[WebGPU] renderer.info', {
        memory: info.memory,
        render: info.render,
      });
    },
  };
}

export function disposePostFX(): void {
  /* PostProcessing releases with renderer teardown */
}
