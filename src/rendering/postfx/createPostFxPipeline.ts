// src/rendering/postfx/createPostFxPipeline.ts — WebGPU RenderPipeline assembly
import {
  type DirectionalLight,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  Vector3,
} from 'three';
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
  godraysBlendWeightForSun,
  godraysElevationWeightRamp,
} from './godraysParams';
import {
  applyLutGrade,
  applyProceduralPostGrade,
  createPostGradeUniforms,
  type PostGradeUniforms,
  setPostGradeLutTexture,
} from './postGrade';
import { applyVignette } from './vignetteEffect';

const { BLOOM, GODRAYS, RENDER } = PHASE0;

let _activeGodraysNode: GodraysNode | null = null;
let _activeGodraysBlur: BilateralBlurNode | null = null;
let _activeDofNode: DepthOfFieldNode | null = null;

export type GpuDebugTargets = RenderDebugTargets;

const _sunDir = new Vector3();
const _camForward = new Vector3();
const _focusDelta = new Vector3();

/** Sun-driven light-shaft (god rays) node graph + tunables. Density/weight react to sun state each frame. */
function createGodraysControls(
  sceneColor: any,
  sceneDepth: any,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
) {
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

  const uGodRaysWeight = uniform(0);
  let lastGodraysIntensity = 0;
  let lastSunIntensity = 0;
  let lastSunElevationDeg = 0;
  let lastSunHorizonElevationDeg = -90;
  let cohesionWeightMul = 1;

  const applyTunablesLocal = () => {
    applyGodraysTunables(godraysParams, godraysBlend, godraysMaskUniforms);
  };

  /** Applies the current weight to the blend uniform, honoring DEV render-debug overrides. */
  const applyWeight = () => {
    if (
      import.meta.env.DEV &&
      (devSettings.renderDebug.disableGodRays || devSettings.renderDebug.disableShadows)
    ) {
      uGodRaysWeight.value = 0;
      return;
    }
    uGodRaysWeight.value = lastGodraysIntensity * cohesionWeightMul;
  };

  /** Pure sun-state update: recomputes density/weight from sun intensity + elevation above horizon. */
  const updateFromSun = (intensity: number, elevationDeg: number, horizonElevationDeg: number) => {
    lastSunIntensity = intensity;
    lastSunElevationDeg = elevationDeg;
    lastSunHorizonElevationDeg = horizonElevationDeg;
    const p = godraysParams;
    const elevAboveHorizonDeg = elevationDeg - horizonElevationDeg;
    const elevRamp = godraysElevationWeightRamp(elevAboveHorizonDeg, p);
    lastGodraysIntensity = godraysBlendWeightForSun(intensity, elevAboveHorizonDeg, p);

    sunDirectionFromSpherical(elevationDeg, currentSunAzimuthDeg(), _sunDir);
    godraysMaskUniforms.sunDirection.value.copy(_sunDir);

    const elevFactor = Math.max(
      p.elevFactorMin,
      Math.min(p.elevFactorMax, 1.05 - elevationDeg / p.elevRayFalloff),
    );
    const intensityFactor = Math.max(0.05, intensity / p.sunIntensityRef) * elevRamp;
    godraysNode.density.value = p.densityBase * elevFactor * intensityFactor;
    godraysNode.maxDensity.value = p.maxDensityBase * elevFactor * elevRamp;
  };

  applyTunablesLocal();

  return {
    godraysBlur,
    godraysBlendOptions,
    uGodRaysWeight,
    getGodraysParams: () => ({ ...godraysParams }),
    updateParams: (params: Partial<GodraysParams>) => {
      godraysParams = { ...godraysParams, ...params };
      applyTunablesLocal();
    },
    updateFromSun,
    getLastSunState: () => ({
      intensity: lastSunIntensity,
      elevationDeg: lastSunElevationDeg,
      horizonElevationDeg: lastSunHorizonElevationDeg,
    }),
    applyWeight,
    setCohesionWeightMul: (mul: number) => {
      cohesionWeightMul = mul;
    },
  };
}

/** Scene bloom node graph + tunables, including the open-sky attenuation mask. */
function createBloomControls(sceneColor: any) {
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
  const bloomTargets = { bloomScene, bloomSkyMaskUniforms };

  const uSceneBloomWeight = uniform(1);
  let bloomParams = defaultBloomParams();
  let cohesionWeightMul = 1;

  const applyTunablesLocal = () => {
    applyBloomTunables(bloomParams, bloomTargets);
  };

  /** Applies the current cohesion weight, honoring the DEV "disable bloom" render-debug override. */
  const applyDebugWeight = () => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableBloom) {
      uSceneBloomWeight.value = 0;
      return;
    }
    uSceneBloomWeight.value = cohesionWeightMul;
  };

  applyTunablesLocal();
  applyDebugWeight();

  return {
    bloomScene,
    bloomSkyMaskUniforms,
    uSceneBloomWeight,
    getBloomParams: () => ({ ...bloomParams }),
    setBloomParams: (params: Partial<BloomParams>) => {
      bloomParams = { ...bloomParams, ...params };
      applyTunablesLocal();
    },
    resetBloomParams: () => {
      const { skyReduce } = bloomParams;
      bloomParams = { ...defaultBloomParams(), skyReduce };
      applyTunablesLocal();
    },
    setBloomSkyReduceFromSun: (elevationDeg: number) => {
      const skyReduce = skyReduceForElevation(elevationDeg);
      if (Math.abs(skyReduce - bloomParams.skyReduce) < 1e-5) return;
      bloomParams = { ...bloomParams, skyReduce };
      bloomSkyMaskUniforms.skyReduce.value = skyReduce;
    },
    setCohesionWeightMul: (mul: number) => {
      cohesionWeightMul = mul;
    },
    applyDebugWeight,
  };
}

/** Depth-of-field node + tunables. Active state also depends on the DEV "disable DoF" override. */
function createDofControls(sharpColor: any, sceneViewZ: any) {
  let dofParams = defaultDofParams();
  const dofUniforms = createDofUniforms(dofParams);
  const { uFocusDistance, uFocalLength, uBokehScale } = dofUniforms;
  let smoothedFocusDistance = Number(uFocusDistance.value);

  const dofNode = dof(sharpColor, sceneViewZ, uFocusDistance, uFocalLength, uBokehScale);
  _activeDofNode = dofNode;

  applyDofTunables(dofParams, dofUniforms);

  return {
    dofColor: dofNode,
    isActive: () =>
      dofParams.enabled && !(import.meta.env.DEV && devSettings.renderDebug.disableDof),
    getDofParams: () => ({ ...dofParams }),
    updateParams: (params: Partial<DofParams>) => {
      dofParams = { ...dofParams, ...params };
      applyDofTunables(dofParams, dofUniforms);
    },
    resetParams: () => {
      dofParams = defaultDofParams();
      applyDofTunables(dofParams, dofUniforms);
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
  };
}

/** Procedural color grade + LUT tunables (applied after `renderOutput`, before DoF). */
function createGradeControls() {
  const gradeUniforms: PostGradeUniforms = createPostGradeUniforms();
  let gradeEnabledBySync = gradeUniforms.uGradeEnabled.value as number;

  /** Applies the current grade-enabled state, honoring the DEV "disable grade" render-debug override. */
  const applyDebug = () => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableGrade) {
      gradeUniforms.uGradeEnabled.value = 0;
      return;
    }
    gradeUniforms.uGradeEnabled.value = gradeEnabledBySync;
  };

  return {
    gradeUniforms,
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
      if (
        scalars.liftR !== undefined ||
        scalars.liftG !== undefined ||
        scalars.liftB !== undefined
      ) {
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
      applyDebug();
    },
    setGradeLut: (lutTexture: Texture | null, size?: number) => {
      setPostGradeLutTexture(gradeUniforms, lutTexture);
      if (size !== undefined) {
        gradeUniforms.uLutSize.value = size;
      }
    },
    applyDebug,
  };
}

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

  const godraysControls = createGodraysControls(sceneColor, sceneDepth, camera, sun);
  const bloomControls = createBloomControls(sceneColor);
  const gradeControls = createGradeControls();

  const uExposure = uniform(Number(RENDER.TONE_MAPPING_EXPOSURE));
  const uVignetteInner = uniform(0.3);
  const uVignetteDarkness = uniform(0.95);
  const uVignetteEnabled = uniform(1);

  let debugTargets: GpuDebugTargets | null = null;
  let lastVignetteEnergyRatio = 0;
  let cohesionVignetteDarknessMul = 1;

  const composite = Fn(() => {
    const uv = screenUV;

    const baseSample = sceneColor.sample(uv);
    const withRaysSample = depthAwareBlend(
      sceneColor,
      godraysControls.godraysBlur.getTextureNode(),
      sceneDepth,
      camera,
      godraysControls.godraysBlendOptions,
    );
    const sceneRgb = mix(baseSample.rgb, withRaysSample.rgb, godraysControls.uGodRaysWeight);
    const sceneDepthSample = sceneDepth.sample(uv).r;
    const bloomAdd = bloomControls.bloomScene
      .mul(bloomControls.uSceneBloomWeight)
      .mul(
        bloomSkyAttenuation(baseSample.rgb, sceneDepthSample, bloomControls.bloomSkyMaskUniforms),
      );
    const bloomed = sceneRgb.add(bloomAdd);
    const toned = toneMapScene(bloomed, uExposure);
    const color = applyVignette(toned, uv, uVignetteInner, uVignetteDarkness, uVignetteEnabled);

    return vec4(color, baseSample.a);
  });

  const graded = composite();
  const sharpColor = Fn(() => {
    const display = renderOutput(graded);
    const procedural = applyProceduralPostGrade(display.rgb, gradeControls.gradeUniforms);
    const rgb = applyLutGrade(procedural, gradeControls.gradeUniforms);
    return vec4(rgb, display.a);
  })();

  const dofControls = createDofControls(sharpColor, sceneViewZ);

  let displayColor = dofControls.isActive() ? dofControls.dofColor : sharpColor;
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
    const nextDisplay = dofControls.isActive() ? dofControls.dofColor : sharpColor;
    if (nextDisplay === displayColor) return;
    displayColor = nextDisplay;
    aaOutput = fxaa(displayColor);
    postProcessing.outputNode = aaEnabled ? aaOutput : displayColor;
    postProcessing.needsUpdate = true;
  };

  const applyGpuDebug = import.meta.env.DEV
    ? () => {
        const d = devSettings.renderDebug;
        bloomControls.applyDebugWeight();
        gradeControls.applyDebug();
        setAa(!d.disableAa);
        // Keep sun.castShadow true — GodraysNode samples shadow depth when the pass runs.
        godraysControls.applyWeight();
        syncDofOutput();
        applyRenderDebug(debugTargets, d);
      }
    : () => {};

  const setGodraysFromSun = (
    intensity: number,
    elevationDeg: number,
    horizonElevationDeg = -90,
  ) => {
    godraysControls.updateFromSun(intensity, elevationDeg, horizonElevationDeg);
    if (import.meta.env.DEV) {
      applyGpuDebug();
    } else {
      godraysControls.applyWeight();
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
        bloomControls.setCohesionWeightMul(scalars.bloomSceneWeightMul);
      }
      if (scalars.godraysWeightMul !== undefined) {
        godraysControls.setCohesionWeightMul(scalars.godraysWeightMul);
      }
      if (scalars.vignetteDarknessMul !== undefined) {
        cohesionVignetteDarknessMul = scalars.vignetteDarknessMul;
      }
      bloomControls.applyDebugWeight();
      if (import.meta.env.DEV) {
        applyGpuDebug();
      } else {
        godraysControls.applyWeight();
      }
      if (uVignetteEnabled.value > 0.5) {
        uVignetteDarkness.value =
          (0.95 - lastVignetteEnergyRatio * 0.55) * cohesionVignetteDarknessMul;
      }
    },
    getAgxExposure: () => uExposure.value as number,
    setAgxExposure: (value: number) => {
      uExposure.value = value;
    },
    getBloomParams: bloomControls.getBloomParams,
    setBloomParams: bloomControls.setBloomParams,
    resetBloomParams: bloomControls.resetBloomParams,
    getGodraysParams: godraysControls.getGodraysParams,
    setGodraysParams: (params: Partial<GodraysParams>) => {
      godraysControls.updateParams(params);
      const last = godraysControls.getLastSunState();
      setGodraysFromSun(last.intensity, last.elevationDeg, last.horizonElevationDeg);
    },
    resetGodraysParams: () => {
      godraysControls.updateParams(defaultGodraysParams());
      const last = godraysControls.getLastSunState();
      setGodraysFromSun(last.intensity, last.elevationDeg, last.horizonElevationDeg);
    },
    setDebugTargets: import.meta.env.DEV
      ? (targets) => {
          debugTargets = targets;
          applyGpuDebug();
        }
      : () => {},
    setGodraysFromSun,
    setBloomSkyReduceFromSun: bloomControls.setBloomSkyReduceFromSun,
    setGradeScalars: gradeControls.setGradeScalars,
    setGradeLut: gradeControls.setGradeLut,
    setDofFocus: dofControls.setDofFocus,
    setDofBokehScale: dofControls.setDofBokehScale,
    getDofParams: dofControls.getDofParams,
    setDofParams: (params: Partial<DofParams>) => {
      dofControls.updateParams(params);
      syncDofOutput();
    },
    resetDofParams: () => {
      dofControls.resetParams();
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
