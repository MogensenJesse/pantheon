// src/rendering/PostFX.ts — WebGPU RenderPipeline + scene-output bloom + god rays
import { Color, Vector2, Vector3, type DirectionalLight, type PerspectiveCamera, type Scene } from 'three';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import type GodraysNode from 'three/addons/tsl/display/GodraysNode.js';
import type BilateralBlurNode from 'three/addons/tsl/display/BilateralBlurNode.js';
import { color, float, Fn, int, mix, pass, renderOutput, screenUV, uniform, vec4 } from 'three/tsl';
import { PHASE0 } from '../config/phase0';
import { VISUAL } from '../config/visualTuning';
import { devSettings } from '../core/GameState';
import { applyRenderDebug, type RenderDebugTargets } from '../dev/RenderDebugController';
import { logGpuSnapshot, maybeLogGpuPeriodic } from './gpuDebugLog';
import { sunDirectionFromSpherical } from './sunSpherical';
import { sunDevState } from './sunDevState';
import { depthAwareBlend } from './postfx/depthAwareBlend.js';
import {
  bloomSkyAttenuation,
  createBloomSkyMaskUniforms,
} from './postfx/bloomSkyMask';
import { setHdrBloomScale } from './glowMaterial';
import { toneMapScene } from './postfx/godraysComposite';
import { createGodraysMaskFn, createGodraysMaskUniforms } from './postfx/godraysMask';
import { pixelatedUv } from './postfx/pixelateEffect';
import { applyQuantize } from './postfx/quantizeEffect';
import { applyVignette } from './postfx/vignetteEffect';

const { BLOOM, GODRAYS, RENDER } = PHASE0;

let _activeGodraysNode: GodraysNode | null = null;
let _activeGodraysBlur: BilateralBlurNode | null = null;

/** Dev-tunable bloom (defaults in visualTuning.ts). */
export interface BloomParams {
  emissiveStrength: number;
  radius: number;
  sceneStrengthMul: number;
  exposure: number;
  sceneThreshold: number;
  smoothWidth: number;
  skyDepthStart: number;
  skyDepthEnd: number;
  skySunLumaStart: number;
  skySunLumaEnd: number;
  skyReduce: number;
  hdrScale: number;
}

/** Dev-tunable god rays / light shafts (defaults in visualTuning.ts). */
export interface GodraysParams {
  densityBase: number;
  maxDensityBase: number;
  intensityMul: number;
  weightMin: number;
  weightMax: number;
  tintR: number;
  tintG: number;
  tintB: number;
  edgeRadius: number;
  edgeStrength: number;
  skyLumaStart: number;
  skyLumaEnd: number;
  sunFacingMin: number;
  sunFacingMax: number;
  sunIntensityRef: number;
  elevRayFalloff: number;
  elevFactorMin: number;
  elevFactorMax: number;
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
  getGodraysParams: () => GodraysParams;
  setGodraysParams: (params: Partial<GodraysParams>) => void;
  resetGodraysParams: () => void;
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
    sceneThreshold: BLOOM.SCENE_THRESHOLD,
    smoothWidth: BLOOM.SMOOTH_WIDTH,
    skyDepthStart: BLOOM.SKY_DEPTH_START,
    skyDepthEnd: BLOOM.SKY_DEPTH_END,
    skySunLumaStart: BLOOM.SKY_SUN_LUMA_START,
    skySunLumaEnd: BLOOM.SKY_SUN_LUMA_END,
    skyReduce: BLOOM.SKY_REDUCE,
    hdrScale: BLOOM.HDR_SCALE,
  };
}

function defaultGodraysParams(): GodraysParams {
  const g = VISUAL.godrays;
  return {
    densityBase: g.DENSITY_BASE,
    maxDensityBase: g.MAX_DENSITY_BASE,
    intensityMul: g.INTENSITY_MUL,
    weightMin: g.WEIGHT_MIN,
    weightMax: g.WEIGHT_MAX,
    tintR: g.TINT_R,
    tintG: g.TINT_G,
    tintB: g.TINT_B,
    edgeRadius: g.EDGE_RADIUS,
    edgeStrength: g.EDGE_STRENGTH,
    skyLumaStart: g.SKY_LUMA_START,
    skyLumaEnd: g.SKY_LUMA_END,
    sunFacingMin: g.SUN_FACING_MIN,
    sunFacingMax: g.SUN_FACING_MAX,
    sunIntensityRef: g.SUN_INTENSITY_REF,
    elevRayFalloff: g.ELEV_RAY_FALLOFF,
    elevFactorMin: g.ELEV_FACTOR_MIN,
    elevFactorMax: g.ELEV_FACTOR_MAX,
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

  let godraysParams = defaultGodraysParams();
  const godraysMaskUniforms = createGodraysMaskUniforms({
    skyLumaStart: godraysParams.skyLumaStart,
    skyLumaEnd: godraysParams.skyLumaEnd,
    sunFacingMin: godraysParams.sunFacingMin,
    sunFacingMax: godraysParams.sunFacingMax,
  });
  const godraysMaskFn = createGodraysMaskFn(sceneColor, sceneDepth, camera, godraysMaskUniforms);

  const uBlendColor = uniform(
    color(new Color(godraysParams.tintR, godraysParams.tintG, godraysParams.tintB)),
  );
  const uEdgeRadius = uniform(int(godraysParams.edgeRadius));
  const uEdgeStrength = uniform(float(godraysParams.edgeStrength));
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
  const bloomSkyMaskUniforms = createBloomSkyMaskUniforms({
    skyDepthStart: BLOOM.SKY_DEPTH_START,
    skyDepthEnd: BLOOM.SKY_DEPTH_END,
    skySunLumaStart: BLOOM.SKY_SUN_LUMA_START,
    skySunLumaEnd: BLOOM.SKY_SUN_LUMA_END,
    skyReduce: BLOOM.SKY_REDUCE,
  });

  const uExposure = uniform(Number(RENDER.TONE_MAPPING_EXPOSURE));
  const uPixelSize = uniform(1);
  const uColorLevels = uniform(1);
  const uResolution = uniform(new Vector2(window.innerWidth, window.innerHeight));
  const uVignetteInner = uniform(0.3);
  const uVignetteDarkness = uniform(0.95);
  const uVignetteEnabled = uniform(1);
  const uSceneBloomWeight = uniform(1);
  const uGodRaysWeight = uniform(0);

  let debugTargets: GpuDebugTargets | null = null;
  let bloomParams = defaultBloomParams();
  let lastGodraysIntensity = 0;
  let lastSunIntensity = 0;
  let lastSunElevationDeg = 0;

  const applyGodraysTunables = () => {
    const p = godraysParams;
    uBlendColor.value.set(p.tintR, p.tintG, p.tintB);
    uEdgeRadius.value = Math.round(p.edgeRadius);
    uEdgeStrength.value = p.edgeStrength;
    godraysMaskUniforms.skyLumaStart.value = p.skyLumaStart;
    godraysMaskUniforms.skyLumaEnd.value = p.skyLumaEnd;
    godraysMaskUniforms.sunFacingMin.value = p.sunFacingMin;
    godraysMaskUniforms.sunFacingMax.value = p.sunFacingMax;
  };

  const applyBloomTunables = () => {
    const p = bloomParams;
    bloomScene.strength.value = p.emissiveStrength * p.sceneStrengthMul;
    bloomScene.radius.value = p.radius;
    bloomScene.threshold.value = p.sceneThreshold;
    bloomScene.smoothWidth.value = p.smoothWidth;
    uExposure.value = p.exposure;
    bloomSkyMaskUniforms.skyDepthStart.value = p.skyDepthStart;
    bloomSkyMaskUniforms.skyDepthEnd.value = p.skyDepthEnd;
    bloomSkyMaskUniforms.skySunLumaStart.value = p.skySunLumaStart;
    bloomSkyMaskUniforms.skySunLumaEnd.value = p.skySunLumaEnd;
    bloomSkyMaskUniforms.skyReduce.value = p.skyReduce;
    setHdrBloomScale(p.hdrScale);
  };

  const applyBloomParams = (params: Partial<BloomParams>) => {
    bloomParams = { ...bloomParams, ...params };
    applyBloomTunables();
  };

  applyBloomTunables();

  const composite = Fn(() => {
    const uv = screenUV;
    const { sampleUv } = pixelatedUv(uv, uPixelSize, uResolution);

    const baseSample = sceneColor.sample(sampleUv);
    const withRaysSample = depthAwareBlend(
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
      .mul(bloomSkyAttenuation(baseSample.rgb, sceneDepthSample, bloomSkyMaskUniforms));
    const bloomed = sceneRgb.add(bloomAdd);
    let color = toneMapScene(bloomed, uExposure);
    color = applyQuantize(color, uColorLevels);
    color = applyVignette(color, uv, uVignetteInner, uVignetteDarkness, uVignetteEnabled);

    return vec4(color, baseSample.a);
  });

  // FXAA runs on the final display image: renderOutput applies the output color
  // transform (here just linear->sRGB, since renderer.toneMapping is None) that
  // we disable on the pipeline, so FXAA gets the sRGB input it expects.
  const displayColor = renderOutput(composite());
  const aaOutput = fxaa(displayColor);
  // Honour the AA default (off) so prod and dev start consistent; the dev
  // toggle (disableAa) can still flip it live via setAa.
  let aaEnabled = !devSettings.renderDebug.disableAa;
  const postProcessing = new RenderPipeline(renderer, aaEnabled ? aaOutput : displayColor);
  postProcessing.outputColorTransform = false;

  const setAa = (enabled: boolean) => {
    if (enabled === aaEnabled) return;
    aaEnabled = enabled;
    postProcessing.outputNode = enabled ? aaOutput : displayColor;
    postProcessing.needsUpdate = true;
  };

  const applyGpuDebug = import.meta.env.DEV
    ? () => {
        const d = devSettings.renderDebug;
        uSceneBloomWeight.value = d.disableBloom ? 0 : 1;
        setAa(!d.disableAa);
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

  const setGodraysFromSun = (intensity: number, elevationDeg: number) => {
    lastSunIntensity = intensity;
    lastSunElevationDeg = elevationDeg;
    const p = godraysParams;
    const sunWeight = intensity * p.intensityMul;
    lastGodraysIntensity =
      intensity > 0.01 ? Math.min(Math.max(sunWeight, p.weightMin), p.weightMax) : 0;

    sunDirectionFromSpherical(elevationDeg, sunDevState.azimuthDeg, _sunDir);
    godraysMaskUniforms.sunDirection.value.copy(_sunDir);

    const elevFactor = Math.max(
      p.elevFactorMin,
      Math.min(p.elevFactorMax, 1.05 - elevationDeg / p.elevRayFalloff),
    );
    const intensityFactor = Math.max(0.05, intensity / p.sunIntensityRef);
    godraysNode.density.value = p.densityBase * elevFactor * intensityFactor;
    godraysNode.maxDensity.value = p.maxDensityBase * elevFactor;
    uGodRaysWeight.value = lastGodraysIntensity;
    if (import.meta.env.DEV) applyGpuDebug();
  };

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
    getGodraysParams: () => ({ ...godraysParams }),
    setGodraysParams: (params: Partial<GodraysParams>) => {
      godraysParams = { ...godraysParams, ...params };
      applyGodraysTunables();
      setGodraysFromSun(lastSunIntensity, lastSunElevationDeg);
    },
    resetGodraysParams: () => {
      godraysParams = defaultGodraysParams();
      applyGodraysTunables();
      setGodraysFromSun(lastSunIntensity, lastSunElevationDeg);
    },
    setDebugTargets: import.meta.env.DEV
      ? (targets) => {
          debugTargets = targets;
          applyGpuDebug();
        }
      : () => {},
    setGodraysFromSun,
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
