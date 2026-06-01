// src/rendering/postfx/createPostFxPipeline.ts — WebGPU RenderPipeline assembly
import { type DirectionalLight, type PerspectiveCamera, type Scene, Vector3 } from 'three';
import type BilateralBlurNode from 'three/addons/tsl/display/BilateralBlurNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type DepthOfFieldNode from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import type GodraysNode from 'three/addons/tsl/display/GodraysNode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { Fn, mix, pass, renderOutput, screenUV, uniform, vec4 } from 'three/tsl';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { PHASE0 } from '../../config/phase0';
import { devSettings } from '../../core/GameState';
import { applyRenderDebug, type RenderDebugTargets } from '../../dev/RenderDebugController';
import { logGpuSnapshot, maybeLogGpuPeriodic } from '../debug/gpuDebugLog';
import type { PostFXContext } from '../PostFX';
import { sunDevState } from '../sunDevState';
import { sunDirectionFromSpherical } from '../sunSpherical';
import { applyBloomTunables, type BloomParams, defaultBloomParams } from './bloomParams';
import { bloomSkyAttenuation, createBloomSkyMaskUniforms } from './bloomSkyMask';
// Vendored depthAwareBlend (maskFn for god-ray sky mask) — see depthAwareBlend.js header.
import { depthAwareBlend } from './depthAwareBlend.js';
import { applyDofTunables, createDofUniforms, type DofParams, defaultDofParams } from './dofParams';
import { toneMapScene } from './godraysComposite';
import { createGodraysMaskFn, createGodraysMaskUniforms } from './godraysMask';
import {
  applyGodraysTunables,
  createGodraysBlendUniforms,
  defaultGodraysParams,
  type GodraysParams,
} from './godraysParams';
import { applyVignette } from './vignetteEffect';

const { BLOOM, GODRAYS, RENDER } = PHASE0;

let _activeGodraysNode: GodraysNode | null = null;
let _activeGodraysBlur: BilateralBlurNode | null = null;
let _activeDofNode: DepthOfFieldNode | null = null;

export type GpuDebugTargets = RenderDebugTargets;

const _sunDir = new Vector3();
const _camForward = new Vector3();
const _focusDelta = new Vector3();

export function createPostFxPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
): PostFXContext {
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const sceneViewZ = scenePass.getViewZNode();

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
  const godraysBlend = createGodraysBlendUniforms(godraysParams);
  const godraysBlendOptions = {
    blendColor: godraysBlend.uBlendColor,
    edgeRadius: godraysBlend.uEdgeRadius,
    edgeStrength: godraysBlend.uEdgeStrength,
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
  let dofParams = defaultDofParams();
  const dofUniforms = createDofUniforms(dofParams);
  const { uFocusDistance, uFocalLength, uBokehScale } = dofUniforms;
  let smoothedFocusDistance = Number(uFocusDistance.value);
  let dofActive = dofParams.enabled;

  const syncGodraysPass = (weight: number) => {
    uGodRaysWeight.value = weight;
  };

  const bloomTargets = { bloomScene, bloomSkyMaskUniforms, uExposure };

  const applyGodraysTunablesLocal = () => {
    applyGodraysTunables(godraysParams, godraysBlend, godraysMaskUniforms);
  };

  const applyBloomTunablesLocal = () => {
    applyBloomTunables(bloomParams, bloomTargets);
  };

  const applyBloomParams = (params: Partial<BloomParams>) => {
    bloomParams = { ...bloomParams, ...params };
    applyBloomTunablesLocal();
  };

  applyBloomTunablesLocal();
  applyGodraysTunablesLocal();
  applyDofTunables(dofParams, dofUniforms);

  const composite = Fn(() => {
    const uv = screenUV;

    const baseSample = sceneColor.sample(uv);
    const withRaysSample = depthAwareBlend(
      sceneColor,
      godraysBlur.getTextureNode(),
      sceneDepth,
      camera,
      godraysBlendOptions,
    );
    const sceneRgb = mix(baseSample.rgb, withRaysSample.rgb, uGodRaysWeight);
    const sceneDepthSample = sceneDepth.sample(uv).r;
    const bloomAdd = bloomScene
      .mul(uSceneBloomWeight)
      .mul(bloomSkyAttenuation(baseSample.rgb, sceneDepthSample, bloomSkyMaskUniforms));
    const bloomed = sceneRgb.add(bloomAdd);
    const color = applyVignette(
      toneMapScene(bloomed, uExposure),
      uv,
      uVignetteInner,
      uVignetteDarkness,
      uVignetteEnabled,
    );

    return vec4(color, baseSample.a);
  });

  const graded = composite();
  const sharpColor = renderOutput(graded);
  const dofNode = dof(graded, sceneViewZ, uFocusDistance, uFocalLength, uBokehScale);
  _activeDofNode = dofNode;
  const dofColor = renderOutput(dofNode as unknown as typeof sharpColor);

  let displayColor = dofActive ? dofColor : sharpColor;
  let aaOutput = fxaa(displayColor);
  let aaEnabled = !devSettings.renderDebug.disableAa;
  const postProcessing = new RenderPipeline(renderer, aaEnabled ? aaOutput : displayColor);
  postProcessing.outputColorTransform = false;

  const setAa = (enabled: boolean) => {
    if (enabled === aaEnabled) return;
    aaEnabled = enabled;
    postProcessing.outputNode = enabled ? aaOutput : displayColor;
    postProcessing.needsUpdate = true;
  };

  const syncDofOutput = () => {
    dofActive = dofParams.enabled && !(import.meta.env.DEV && devSettings.renderDebug.disableDof);
    const nextDisplay = dofActive ? dofColor : sharpColor;
    if (nextDisplay === displayColor) return;
    displayColor = nextDisplay;
    aaOutput = fxaa(displayColor);
    postProcessing.outputNode = aaEnabled ? aaOutput : displayColor;
    postProcessing.needsUpdate = true;
  };

  const applyGpuDebug = import.meta.env.DEV
    ? () => {
        const d = devSettings.renderDebug;
        uSceneBloomWeight.value = d.disableBloom ? 0 : 1;
        setAa(!d.disableAa);
        // Keep sun.castShadow true — GodraysNode samples shadow depth when the pass runs.
        const rayWeight = d.disableGodRays || d.disableShadows ? 0 : lastGodraysIntensity;
        syncGodraysPass(rayWeight);
        syncDofOutput();
        applyRenderDebug(debugTargets, d);
      }
    : () => {};

  if (import.meta.env.DEV) {
    console.info('[RenderDebug] postFX', {
      bloomSource: 'scene output (single RT)',
      godrays: 'GodraysNode + bilateralBlur + depthAwareBlend',
      dof: 'DepthOfFieldNode (bokeh scales with energy)',
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
    if (import.meta.env.DEV) {
      applyGpuDebug();
    } else {
      syncGodraysPass(lastGodraysIntensity);
    }
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
    setVignetteStrength: (energyRatio: number) => {
      uVignetteInner.value = 0.3 + energyRatio * 0.55;
      uVignetteDarkness.value = 0.95 - energyRatio * 0.55;
    },
    disableVignette: () => {
      uVignetteEnabled.value = 0;
    },
    getBloomParams: () => ({ ...bloomParams }),
    setBloomParams: applyBloomParams,
    resetBloomParams: () => applyBloomParams(defaultBloomParams()),
    getGodraysParams: () => ({ ...godraysParams }),
    setGodraysParams: (params: Partial<GodraysParams>) => {
      godraysParams = { ...godraysParams, ...params };
      applyGodraysTunablesLocal();
      setGodraysFromSun(lastSunIntensity, lastSunElevationDeg);
    },
    resetGodraysParams: () => {
      godraysParams = defaultGodraysParams();
      applyGodraysTunablesLocal();
      setGodraysFromSun(lastSunIntensity, lastSunElevationDeg);
    },
    setDebugTargets: import.meta.env.DEV
      ? (targets) => {
          debugTargets = targets;
          applyGpuDebug();
        }
      : () => {},
    setGodraysFromSun,
    setDofFocus: (cam: PerspectiveCamera, focusWorld: Vector3, delta: number) => {
      cam.getWorldDirection(_camForward);
      _focusDelta.subVectors(focusWorld, cam.position);
      const target = Math.max(0.1, _focusDelta.dot(_camForward) + dofParams.focusDistanceOffset);
      const t = 1 - Math.exp(-dofParams.focusSmooth * Math.max(delta, 0));
      smoothedFocusDistance += (target - smoothedFocusDistance) * t;
      uFocusDistance.value = smoothedFocusDistance;
    },
    setDofBokehScale: (scale: number) => {
      uBokehScale.value = Math.max(0, scale);
    },
    getDofParams: () => ({ ...dofParams }),
    setDofParams: (params: Partial<DofParams>) => {
      dofParams = { ...dofParams, ...params };
      applyDofTunables(dofParams, dofUniforms);
      syncDofOutput();
    },
    resetDofParams: () => {
      dofParams = defaultDofParams();
      applyDofTunables(dofParams, dofUniforms);
      syncDofOutput();
    },
    logGpuInfo: () => {
      logGpuSnapshot(renderer, devSettings.renderDebug, true);
    },
  };
}

export function disposePostFxPipeline(): void {
  _activeGodraysBlur?.dispose();
  _activeGodraysBlur = null;
  _activeGodraysNode?.dispose();
  _activeGodraysNode = null;
  _activeDofNode?.dispose();
  _activeDofNode = null;
}
