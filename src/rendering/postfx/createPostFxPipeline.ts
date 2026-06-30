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
import type { PostFXContext, PostFxGradeScalars } from '../PostFX';
import { skyReduceForElevation } from '../sky/lightingCurves';
import { currentSunAzimuthDeg, sunDirectionFromSpherical } from '../sunSpherical';
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
import {
  applyPostGrade,
  createPostGradeUniforms,
  setPostGradeLutTexture,
  type PostGradeUniforms,
} from './postGrade';

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
  const scenePass = pass(scene, camera, { samples: 0 });
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
    skyReduce: BLOOM.SKY_REDUCE_LOW,
  });

  const uExposure = uniform(Number(RENDER.TONE_MAPPING_EXPOSURE));
  const uVignetteInner = uniform(0.3);
  const uVignetteDarkness = uniform(0.95);
  const uVignetteEnabled = uniform(1);
  const uSceneBloomWeight = uniform(1);
  const uGodRaysWeight = uniform(0);

  const gradeUniforms: PostGradeUniforms = createPostGradeUniforms();
  let gradeEnabledBySync = gradeUniforms.uGradeEnabled.value as number;

  let debugTargets: GpuDebugTargets | null = null;
  let bloomParams = defaultBloomParams();
  let lastGodraysIntensity = 0;
  let lastSunIntensity = 0;
  let lastSunElevationDeg = 0;
  let cohesionBloomWeightMul = 1;
  let cohesionGodraysWeightMul = 1;
  let cohesionVignetteDarknessMul = 1;
  let lastVignetteEnergyRatio = 0;
  let dofParams = defaultDofParams();
  const dofUniforms = createDofUniforms(dofParams);
  const { uFocusDistance, uFocalLength, uBokehScale } = dofUniforms;
  let smoothedFocusDistance = Number(uFocusDistance.value);
  let dofActive = dofParams.enabled;

  const syncGodraysPass = (weight: number) => {
    uGodRaysWeight.value = weight;
  };

  const applyCohesionBloomWeight = () => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableBloom) {
      uSceneBloomWeight.value = 0;
      return;
    }
    uSceneBloomWeight.value = cohesionBloomWeightMul;
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
  applyCohesionBloomWeight();

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
    const toned = toneMapScene(bloomed, uExposure);
    const colorGraded = applyPostGrade(toned, gradeUniforms);
    const color = applyVignette(
      colorGraded,
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

  const applyGradeDebug = () => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableGrade) {
      gradeUniforms.uGradeEnabled.value = 0;
      return;
    }
    gradeUniforms.uGradeEnabled.value = gradeEnabledBySync;
  };

  const applyGpuDebug = import.meta.env.DEV
    ? () => {
        const d = devSettings.renderDebug;
        applyCohesionBloomWeight();
        applyGradeDebug();
        setAa(!d.disableAa);
        // Keep sun.castShadow true — GodraysNode samples shadow depth when the pass runs.
        const rayWeight =
          d.disableGodRays || d.disableShadows
            ? 0
            : lastGodraysIntensity * cohesionGodraysWeightMul;
        syncGodraysPass(rayWeight);
        syncDofOutput();
        applyRenderDebug(debugTargets, d);
      }
    : () => {};

  const setGodraysFromSun = (intensity: number, elevationDeg: number) => {
    lastSunIntensity = intensity;
    lastSunElevationDeg = elevationDeg;
    const p = godraysParams;
    const sunWeight = intensity * p.intensityMul;
    lastGodraysIntensity =
      intensity > 0.01 ? Math.min(Math.max(sunWeight, p.weightMin), p.weightMax) : 0;

    sunDirectionFromSpherical(elevationDeg, currentSunAzimuthDeg(), _sunDir);
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
      syncGodraysPass(lastGodraysIntensity * cohesionGodraysWeightMul);
    }
  };

  const setBloomSkyReduceFromSun = (elevationDeg: number) => {
    const skyReduce = skyReduceForElevation(elevationDeg);
    if (Math.abs(skyReduce - bloomParams.skyReduce) < 1e-5) return;
    bloomParams = { ...bloomParams, skyReduce };
    bloomSkyMaskUniforms.skyReduce.value = skyReduce;
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
    setVignetteStrength: (energyRatio: number, darknessMul?: number) => {
      lastVignetteEnergyRatio = energyRatio;
      const mul = darknessMul ?? cohesionVignetteDarknessMul;
      uVignetteInner.value = 0.3 + energyRatio * 0.55;
      uVignetteDarkness.value = (0.95 - energyRatio * 0.55) * mul;
    },
    disableVignette: () => {
      uVignetteEnabled.value = 0;
    },
    setCohesionScalars: (scalars) => {
      if (scalars.bloomSceneWeightMul !== undefined) {
        cohesionBloomWeightMul = scalars.bloomSceneWeightMul;
      }
      if (scalars.godraysWeightMul !== undefined) {
        cohesionGodraysWeightMul = scalars.godraysWeightMul;
      }
      if (scalars.vignetteDarknessMul !== undefined) {
        cohesionVignetteDarknessMul = scalars.vignetteDarknessMul;
      }
      applyCohesionBloomWeight();
      if (import.meta.env.DEV) {
        applyGpuDebug();
      } else {
        syncGodraysPass(lastGodraysIntensity * cohesionGodraysWeightMul);
      }
      if (uVignetteEnabled.value > 0.5) {
        uVignetteDarkness.value =
          (0.95 - lastVignetteEnergyRatio * 0.55) * cohesionVignetteDarknessMul;
      }
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
    setBloomSkyReduceFromSun,
    setGradeScalars: (scalars: PostFxGradeScalars) => {
      if (scalars.enabled !== undefined) {
        gradeEnabledBySync = scalars.enabled;
      }
      if (scalars.saturation !== undefined) {
        gradeUniforms.uGradeSaturation.value = scalars.saturation;
      }
      if (scalars.contrast !== undefined) {
        gradeUniforms.uGradeContrast.value = scalars.contrast;
      }
      if (scalars.liftR !== undefined || scalars.liftG !== undefined || scalars.liftB !== undefined) {
        const lift = gradeUniforms.uGradeLift.value as { r: number; g: number; b: number };
        if (scalars.liftR !== undefined) lift.r = scalars.liftR;
        if (scalars.liftG !== undefined) lift.g = scalars.liftG;
        if (scalars.liftB !== undefined) lift.b = scalars.liftB;
      }
      if (scalars.warmth !== undefined) {
        gradeUniforms.uGradeWarmth.value = scalars.warmth;
      }
      if (scalars.lutEnabled !== undefined) {
        gradeUniforms.uLutEnabled.value = scalars.lutEnabled;
      }
      if (scalars.lutStrength !== undefined) {
        gradeUniforms.uLutStrength.value = scalars.lutStrength;
      }
      applyGradeDebug();
    },
    setGradeLut: (lutTexture, size) => {
      setPostGradeLutTexture(gradeUniforms, lutTexture);
      if (size !== undefined) {
        gradeUniforms.uLutSize.value = size;
      }
    },
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
