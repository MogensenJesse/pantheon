// src/rendering/postfx/createPostFxPipeline.ts — WebGPU RenderPipeline assembly
import type { DirectionalLight, PerspectiveCamera, Scene } from 'three';
import type FSR1Node from 'three/addons/tsl/display/FSR1Node.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import {
  agxToneMapping,
  Fn,
  mix,
  pass,
  renderOutput,
  rtt,
  screenUV,
  uniform,
  vec4,
} from 'three/tsl';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { type UpscalingSettings, VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../PostFX';
import { bloomSkyAttenuation } from './bloomSkyMask';
import { createBloomControls } from './controls/bloomControls';
import { createDofControls, disposeActiveDof } from './controls/dofControls';
import { createGodraysControls, disposeActiveGodrays } from './controls/godraysControls';
import { createGradeControls } from './controls/gradeControls';
// Vendored depthAwareBlend (maskFn for god-ray sky mask) — see depthAwareBlend.js header.
import { depthAwareBlend, type TslNode } from './depthAwareBlend.js';
import type { DofParams } from './dofParams';
import { defaultGodraysParams, type GodraysParams } from './godraysParams';
import { createPostFxGpuDebug, type GpuDebugTargets } from './postfxDevDebug';
import { createPostFxGpuLogHooks } from './postfxGpuDebugLog';
import { applyLutGrade, applyProceduralPostGrade } from './postGrade';
import { applyVignette } from './vignetteEffect';

export type { GpuDebugTargets };

const { render: RENDER } = VISUAL;

let _activeRenderPipeline: RenderPipeline | null = null;
let _activeFsrNode: FSR1Node | null = null;

export function createPostFxPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
): PostFXContext {
  let upscalingState: UpscalingSettings = { ...RENDER.upscaling };

  const scenePass = pass(scene, camera, { samples: 0 });
  const scenePassWithScale = scenePass as PassNodeWithResolutionScale;

  const applySceneResolutionScale = () => {
    const scale = upscalingState.enabled ? upscalingState.resolutionScale : 1;
    scenePassWithScale.setResolutionScale(scale);
  };
  applySceneResolutionScale();

  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const sceneViewZ = scenePass.getViewZNode();

  const godraysControls = createGodraysControls(sceneColor, sceneDepth, camera, sun);
  const bloomControls = createBloomControls(sceneColor);
  const gradeControls = createGradeControls();

  const uExposure = uniform(Number(RENDER.toneMappingExposure));
  const uVignetteInner = uniform(0.3);
  const uVignetteDarkness = uniform(0.95);
  const uVignetteEnabled = uniform(1);

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
    const toned = agxToneMapping(bloomed, uExposure);
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

  let displayColor: TslNode = dofControls.isActive() ? dofControls.dofColor : sharpColor;
  let aaOutput: TslNode = fxaa(displayColor);
  let aaEnabled = true;

  const uFsrSharpness = uniform(upscalingState.sharpness);
  const uFsrDenoise = uniform(upscalingState.denoise);
  let lowResRtt: RttNodeWithResolutionScale | null = null;
  let lowResSourceNode: TslNode | null = null;
  let fsrNode: FSR1Node | null = null;
  let fsrSourceNode: TslNode | null = null;
  let pipelineOutputNode: TslNode | null = null;

  const getUpscalingScale = () => {
    if (!upscalingState.enabled) return 1;
    return upscalingState.resolutionScale;
  };

  const shouldUseFsr = () => {
    const scale = getUpscalingScale();
    if (import.meta.env.DEV && devSettings.renderDebug.disableFsr) return false;
    return scale < 1 && upscalingState.method === 'fsr1';
  };

  const disposeLowResRtt = () => {
    lowResRtt = null;
    lowResSourceNode = null;
  };

  const disposeFsrNode = () => {
    if (!fsrNode) return;
    fsrNode.dispose();
    fsrNode = null;
    fsrSourceNode = null;
    _activeFsrNode = null;
  };

  /**
   * Scene pass is low-res, but sampling it with screenUV in the post chain upscales immediately.
   * Bake FXAA (and upstream post) into a matching low-res RTT so FSR EASU / bilinear compare fairly.
   */
  const ensureLowResOutput = (colorNode: TslNode): TslNode => {
    const scale = getUpscalingScale();
    if (scale >= 1) {
      disposeLowResRtt();
      return colorNode;
    }
    if (lowResRtt && lowResSourceNode === colorNode) {
      lowResRtt.setResolutionScale(scale);
      return lowResRtt as TslNode;
    }
    disposeLowResRtt();
    lowResRtt = rtt(colorNode) as RttNodeWithResolutionScale;
    lowResRtt.setResolutionScale(scale);
    lowResSourceNode = colorNode;
    return lowResRtt as TslNode;
  };

  /** Reuse one FSR1Node — recreating it disposes GPU RTs and leaks if done every frame (DEV applyGpuDebug). */
  const ensureFsrWrapper = (colorNode: TslNode): TslNode => {
    const lowResOut = ensureLowResOutput(colorNode);
    if (!shouldUseFsr()) {
      disposeFsrNode();
      return lowResOut;
    }
    if (fsrNode && fsrSourceNode === lowResOut) {
      return fsrNode as TslNode;
    }
    disposeFsrNode();
    fsrNode = fsr1(lowResOut, uFsrSharpness, uFsrDenoise);
    fsrSourceNode = lowResOut;
    _activeFsrNode = fsrNode;
    return fsrNode as TslNode;
  };

  const rebuildPipelineOutput = () => {
    const nextDisplay = dofControls.isActive() ? dofControls.dofColor : sharpColor;
    if (nextDisplay !== displayColor) {
      displayColor = nextDisplay;
      aaOutput = fxaa(displayColor);
    }
    const colorNode = aaEnabled ? aaOutput : displayColor;
    const nextOutput = ensureFsrWrapper(colorNode);
    if (nextOutput === pipelineOutputNode) return;
    pipelineOutputNode = nextOutput;
    postProcessing.outputNode = pipelineOutputNode;
    postProcessing.needsUpdate = true;
  };
  const postProcessing = new RenderPipeline(renderer, ensureFsrWrapper(aaOutput));
  pipelineOutputNode = postProcessing.outputNode as TslNode;
  _activeRenderPipeline = postProcessing;
  postProcessing.outputColorTransform = false;

  const setAaEnabled = (enabled: boolean) => {
    aaEnabled = enabled;
  };

  const { applyGpuDebug, setDebugTargets } = createPostFxGpuDebug({
    bloomControls,
    godraysControls,
    gradeControls,
    setAaEnabled,
    rebuildPipelineOutput,
  });
  const gpuLog = createPostFxGpuLogHooks(renderer);

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
          gpuLog.maybeLogPeriodic(devSettings.renderDebug);
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
      if (import.meta.env.DEV) {
        applyGpuDebug();
      } else {
        bloomControls.applyDebugWeight();
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
    setDebugTargets,
    setGodraysFromSun,
    setBloomSkyReduceFromSun: bloomControls.setBloomSkyReduceFromSun,
    setGradeScalars: gradeControls.setGradeScalars,
    setGradeLut: gradeControls.setGradeLut,
    setDofFocus: dofControls.setDofFocus,
    setDofBokehScale: dofControls.setDofBokehScale,
    getDofParams: dofControls.getDofParams,
    setDofParams: (params: Partial<DofParams>) => {
      dofControls.updateParams(params);
      rebuildPipelineOutput();
    },
    resetDofParams: () => {
      dofControls.resetParams();
      rebuildPipelineOutput();
    },
    getUpscalingSettings: () => ({ ...upscalingState }),
    setUpscalingSettings: (params: Partial<UpscalingSettings>) => {
      upscalingState = { ...upscalingState, ...params };
      if (params.sharpness !== undefined) {
        uFsrSharpness.value = params.sharpness;
      }
      if (params.denoise !== undefined) {
        uFsrDenoise.value = params.denoise;
      }
      applySceneResolutionScale();
      rebuildPipelineOutput();
    },
    logGpuInfo: () => {
      gpuLog.logGpuInfo(devSettings.renderDebug);
    },
  };
}

export function disposePostFxPipeline(): void {
  _activeRenderPipeline?.dispose();
  _activeRenderPipeline = null;
  _activeFsrNode?.dispose();
  _activeFsrNode = null;
  disposeActiveGodrays();
  disposeActiveDof();
}
