// src/rendering/PostFX.ts — WebGPU RenderPipeline + scene-output bloom + god rays
import { Color, Vector2, Vector3, type DirectionalLight, type PerspectiveCamera, type Scene } from 'three';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import type GodraysNode from 'three/addons/tsl/display/GodraysNode.js';
import type BilateralBlurNode from 'three/addons/tsl/display/BilateralBlurNode.js';
import { color, float, Fn, int, mix, pass, screenUV, uniform, vec4 } from 'three/tsl';
import { PHASE0 } from '../config/phase0';
import { devSettings } from '../core/GameState';
import { applyRenderDebug, type RenderDebugTargets } from '../dev/RenderDebugController';
import { logGpuSnapshot, maybeLogGpuPeriodic } from './gpuDebugLog';
import { sunDirectionFromSpherical } from './sunSpherical';
import { sunDevState } from './sunDevState';
import { depthAwareBlend } from './postfx/depthAwareBlend.js';
import { bloomSkyAttenuation } from './postfx/bloomSkyMask';
import { applyEdgeAa } from './postfx/edgeAaEffect';
import { toneMapScene } from './postfx/godraysComposite';
import { createGodraysMaskFn, createGodraysMaskUniforms } from './postfx/godraysMask';
import { pixelatedUv } from './postfx/pixelateEffect';
import { applyQuantize } from './postfx/quantizeEffect';
import { applyVignette } from './postfx/vignetteEffect';

const { BLOOM, GODRAYS, RENDER } = PHASE0;

let _activeGodraysNode: GodraysNode | null = null;
let _activeGodraysBlur: BilateralBlurNode | null = null;

/** Dev-tunable bloom (see phase0.ts for fixed threshold / HDR constants). */
export interface BloomParams {
  emissiveStrength: number;
  radius: number;
  sceneStrengthMul: number;
  exposure: number;
}

export type GpuDebugTargets = RenderDebugTargets;

export interface PostFXContext {
  render: () => void;
  resize: (width: number, height: number) => void;
  setVignetteStrength: (energyRatio: number) => void;
  disableVignette: () => void;
  setPixelSize: (size: number) => void;
  setColorLevels: (levels: number) => void;
  getBloomParams: () => BloomParams;
  setBloomParams: (params: Partial<BloomParams>) => void;
  resetBloomParams: () => void;
  setDebugTargets: (targets: GpuDebugTargets) => void;
  setGodraysFromSun: (intensity: number, elevationDeg: number) => void;
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

const _sunDir = new Vector3();

export function initPostFX(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
): PostFXContext {
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');

  const godraysNode = godrays(sceneDepth, camera, sun);
  _activeGodraysNode = godraysNode;
  const godraysBlur = bilateralBlur(
    godraysNode.getTextureNode(),
    undefined,
    GODRAYS.BLUR_SIGMA,
    GODRAYS.BLUR_SIGMA_COLOR,
  );
  _activeGodraysBlur = godraysBlur;

  const godraysMaskUniforms = createGodraysMaskUniforms();
  const godraysMaskFn = createGodraysMaskFn(sceneColor, sceneDepth, camera, godraysMaskUniforms);

  const uBlendColor = uniform(
    color(new Color(GODRAYS.TINT_R, GODRAYS.TINT_G, GODRAYS.TINT_B)),
  );
  const uEdgeRadius = uniform(int(GODRAYS.EDGE_RADIUS));
  const uEdgeStrength = uniform(float(GODRAYS.EDGE_STRENGTH));
  const godraysBlendOptions = {
    blendColor: uBlendColor,
    edgeRadius: uEdgeRadius,
    edgeStrength: uEdgeStrength,
    maskFn: godraysMaskFn,
  };

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
  const uGodRaysWeight = uniform(0);

  let debugTargets: GpuDebugTargets | null = null;
  let bloomParams = defaultBloomParams();
  let lastGodraysIntensity = 0;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withRaysSample: any = depthAwareBlend(
      sceneColor,
      godraysBlur.getTextureNode(),
      sceneDepth,
      camera,
      godraysBlendOptions,
    );
    const sceneRgb = mix(baseSample.rgb, withRaysSample.rgb, uGodRaysWeight);
    const sceneDepthSample = sceneDepth.sample(sampleUv).r;
    const bloomAdd = bloomScene
      .mul(uSceneBloomWeight)
      .mul(bloomSkyAttenuation(baseSample.rgb, sceneDepthSample));
    const bloomed = sceneRgb.add(bloomAdd);
    let color = toneMapScene(bloomed, uExposure);
    color = applyQuantize(color, uColorLevels);
    const withEdgeAa = applyEdgeAa(sceneColor, uv, color, uResolution);
    color = mix(color, withEdgeAa, uEdgeAaEnabled);
    color = applyVignette(color, uv, uVignetteInner, uVignetteDarkness, uVignetteEnabled);

    return vec4(color, baseSample.a);
  });

  const postProcessing = new RenderPipeline(renderer, composite());

  const applyGpuDebug = import.meta.env.DEV
    ? () => {
        const d = devSettings.renderDebug;
        uSceneBloomWeight.value = d.disableBloom ? 0 : 1;
        uEdgeAaEnabled.value = d.disableEdgeAa ? 0 : 1;
        uGodRaysWeight.value = d.disableGodRays ? 0 : lastGodraysIntensity;
        applyRenderDebug(debugTargets, d);
      }
    : () => {};

  if (import.meta.env.DEV) {
    console.info('[RenderDebug] postFX', {
      bloomSource: 'scene output (single RT)',
      godrays: 'GodraysNode + bilateralBlur + depthAwareBlend',
      mrt: false,
      strength: bloomScene.strength.value,
      radius: bloomScene.radius.value,
    });
  }

  return {
    render: import.meta.env.DEV
      ? () => {
          applyGpuDebug();
          postProcessing.render();
          maybeLogGpuPeriodic(renderer, devSettings.renderDebug);
        }
      : () => {
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
    getBloomParams: () => ({ ...bloomParams }),
    setBloomParams: applyBloomParams,
    resetBloomParams: () => applyBloomParams(defaultBloomParams()),
    setDebugTargets: import.meta.env.DEV
      ? (targets) => {
          debugTargets = targets;
          applyGpuDebug();
        }
      : () => {},
    setGodraysFromSun: (intensity: number, elevationDeg: number) => {
      const sunWeight = intensity * GODRAYS.INTENSITY_MUL;
      lastGodraysIntensity =
        intensity > 0.01
          ? Math.min(Math.max(sunWeight, GODRAYS.WEIGHT_MIN), GODRAYS.WEIGHT_MAX)
          : 0;

      sunDirectionFromSpherical(elevationDeg, sunDevState.azimuthDeg, _sunDir);
      godraysMaskUniforms.sunDirection.value.copy(_sunDir);

      const elevFactor = Math.max(
        GODRAYS.ELEV_FACTOR_MIN,
        Math.min(GODRAYS.ELEV_FACTOR_MAX, 1.05 - elevationDeg / GODRAYS.ELEV_RAY_FALLOFF),
      );
      const intensityFactor = Math.max(0.05, intensity / GODRAYS.SUN_INTENSITY_REF);
      godraysNode.density.value = GODRAYS.DENSITY_BASE * elevFactor * intensityFactor;
      godraysNode.maxDensity.value = GODRAYS.MAX_DENSITY_BASE * elevFactor;
      // In prod, applyGpuDebug is a no-op, so write the godrays weight directly
      // here to keep the uniform synced. In DEV the next frame's applyGpuDebug
      // will overwrite this anyway (it honours disableGodRays).
      uGodRaysWeight.value = lastGodraysIntensity;
      if (import.meta.env.DEV) applyGpuDebug();
    },
    logGpuInfo: () => {
      logGpuSnapshot(renderer, devSettings.renderDebug, true);
    },
  };
}

export function disposePostFX(): void {
  _activeGodraysBlur?.dispose();
  _activeGodraysBlur = null;
  _activeGodraysNode?.dispose();
  _activeGodraysNode = null;
}
