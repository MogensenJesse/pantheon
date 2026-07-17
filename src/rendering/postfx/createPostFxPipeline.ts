// src/rendering/postfx/createPostFxPipeline.ts — WebGPU RenderPipeline assembly
import type { DirectionalLight, PerspectiveCamera, Scene } from 'three';
import type FSR1Node from 'three/addons/tsl/display/FSR1Node.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import type SMAANode from 'three/addons/tsl/display/SMAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
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
import { type AaMethod, type UpscalingSettings, VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../PostFX';
import { bloomSkyAttenuation } from './bloomSkyMask';
import { createBloomControls } from './controls/bloomControls';
import { createDofControls, disposeActiveDof } from './controls/dofControls';
import { createGodraysControls, disposeActiveGodrays } from './controls/godraysControls';
import { createGradeControls } from './controls/gradeControls';
// Vendored depthAwareBlend (maskFn for god-ray sky mask).
import { depthAwareBlend, type TslNode } from './depthAwareBlend.js';
import type { DofParams } from './dofParams';
import { ensureSmaaLookupTextures } from './ensureSmaaLookupTextures';
import { defaultGodraysParams, type GodraysParams } from './godraysParams';
import { createPostFxGpuDebug, type GpuDebugTargets } from './postfxDevDebug';
import { createPostFxGpuLogHooks } from './postfxGpuDebugLog';
import { applyLutGrade, applyProceduralPostGrade } from './postGrade';
import { createSmaaSilhouetteResolveNode } from './smaaSilhouetteResolveTsl';
import { applyVignette } from './vignetteEffect';

export type { GpuDebugTargets };

const { render: RENDER } = VISUAL;

let _activeRenderPipeline: RenderPipeline | null = null;
let _activeFsrNode: FSR1Node | null = null;
let _activeSmaaNode: SMAANode | null = null;

export function createPostFxPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  sun: DirectionalLight,
): PostFXContext {
  let upscalingState: UpscalingSettings = { ...RENDER.upscaling };
  let aaMethod: AaMethod = RENDER.aaMethod;
  /** When false (DEV disableAa), skip FXAA/SMAA regardless of aaMethod. */
  let aaEnabled = true;

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
  const sceneBeauty: TslNode = sceneColor;

  const bloomControls = createBloomControls(sceneBeauty);
  const godraysControls = createGodraysControls(sceneBeauty, sceneDepth, camera, sun);
  const gradeControls = createGradeControls();

  const uExposure = uniform(Number(RENDER.toneMappingExposure));
  const uVignetteInner = uniform(0.3);
  const uVignetteDarkness = uniform(0.95);
  const uVignetteEnabled = uniform(1);

  let lastVignetteEnergyRatio = 0;
  let cohesionVignetteDarknessMul = 1;

  const buildComposite = () =>
    Fn(() => {
      const uv = screenUV;

      const baseSample = sceneBeauty.sample(uv);
      let sceneRgb = baseSample.rgb;
      const withRaysSample = depthAwareBlend(
        sceneBeauty,
        godraysControls.godraysBlur.getTextureNode(),
        sceneDepth,
        camera,
        godraysControls.godraysBlendOptions,
      );
      sceneRgb = mix(sceneRgb, withRaysSample.rgb, godraysControls.uGodRaysWeight);
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

  const buildSharpColor = (gradedNode: TslNode) =>
    Fn(() => {
      const display = renderOutput(gradedNode);
      const procedural = applyProceduralPostGrade(display.rgb, gradeControls.gradeUniforms);
      const rgb = applyLutGrade(procedural, gradeControls.gradeUniforms);
      return vec4(rgb, display.a);
    })();

  let lastDofBokehScale: number = VISUAL.dof.BOKEH_SCALE_START;

  const uFsrSharpness = uniform(upscalingState.sharpness);
  const uFsrDenoise = uniform(upscalingState.denoise);
  let lowResRtt: RttNodeWithResolutionScale | null = null;
  let lowResSourceNode: TslNode | null = null;
  let fsrNode: FSR1Node | null = null;
  let fsrSourceNode: TslNode | null = null;
  let smaaNode: SMAANode | null = null;
  let smaaSourceNode: TslNode | null = null;
  /** Explicit composite bake — SMAA edge detect must sample a real color RT, not a nested Fn. */
  let gradedRtt: TslNode | null = null;
  let gradedRttSource: TslNode | null = null;
  /** Cached silhouette resolve (morph + soft + short edge walk). */
  let smaaOutRtt: TslNode | null = null;
  let smaaOutSource: TslNode | null = null;
  let pipelineOutputNode: TslNode | null = null;

  let graded: TslNode;
  let sharpColor: TslNode;
  let dofControls: ReturnType<typeof createDofControls>;
  let displayColor: TslNode;
  let aaOutput: TslNode;

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

  const disposeSmaaNode = () => {
    if (!smaaNode) return;
    smaaNode.dispose();
    smaaNode = null;
    smaaSourceNode = null;
    _activeSmaaNode = null;
  };

  const disposeSmaaBake = () => {
    disposeSmaaNode();
    gradedRtt = null;
    gradedRttSource = null;
    smaaOutRtt = null;
    smaaOutSource = null;
  };

  /**
   * SMAA wants linear/working-space input (before renderOutput / sRGB).
   * Official blend + contrast-gated silhouette soft + short FXAA-style edge walk
   * (see smaaSilhouetteResolveTsl.ts). FXAA wants display-referred input (after grade/DoF).
   */
  const ensureSmaaOnGraded = (gradedNode: TslNode): TslNode => {
    if (!gradedRtt || gradedRttSource !== gradedNode) {
      disposeSmaaBake();
      gradedRtt = rtt(gradedNode) as TslNode;
      gradedRttSource = gradedNode;
    }
    if (!smaaNode || smaaSourceNode !== gradedRtt) {
      disposeSmaaNode();
      smaaOutRtt = null;
      smaaOutSource = null;
      // gradedRtt is already a TextureNode — smaa()'s convertToTexture returns it as-is.
      smaaNode = smaa(gradedRtt);
      smaaSourceNode = gradedRtt;
      _activeSmaaNode = smaaNode;
      ensureSmaaLookupTextures(smaaNode, renderer);
    }

    const smaaTex = smaaNode.getTextureNode() as unknown as TslNode;
    const internals = smaaNode as unknown as {
      _edgesTextureUniform: TslNode;
      _invSize: TslNode;
    };

    // Rebuild silhouette-aware resolve whenever SMAA input changes.
    const edgeKey = smaaTex;
    if (!smaaOutRtt || smaaOutSource !== edgeKey) {
      smaaOutSource = edgeKey;
      smaaOutRtt = createSmaaSilhouetteResolveNode({
        smaaTex,
        edgesTex: internals._edgesTextureUniform,
        colorTex: gradedRtt,
        invSize: internals._invSize,
      });
    }
    return smaaOutRtt;
  };

  const resolvePipelineColor = (): TslNode => {
    if (!aaEnabled || aaMethod === 'off') {
      disposeSmaaBake();
      return displayColor;
    }
    if (aaMethod === 'fxaa') {
      disposeSmaaBake();
      return aaOutput;
    }
    // SMAA already applied upstream of displayColor via ensureSmaaOnGraded.
    return displayColor;
  };

  /**
   * Scene pass is low-res, but sampling it with screenUV in the post chain upscales immediately.
   * Bake AA (and upstream post) into a matching low-res RTT so FSR EASU / bilinear compare fairly.
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

  const rebuildPostGraph = () => {
    applySceneResolutionScale();
    graded = buildComposite()();
    // SMAA: before renderOutput (working color). FXAA: after display (sRGB).
    const useSmaa = aaEnabled && aaMethod === 'smaa';
    const useFxaa = aaEnabled && aaMethod === 'fxaa';
    const gradedForDisplay = useSmaa ? ensureSmaaOnGraded(graded) : graded;
    if (!useSmaa) disposeSmaaBake();
    sharpColor = buildSharpColor(gradedForDisplay);
    disposeActiveDof();
    dofControls = createDofControls(sharpColor, sceneViewZ);
    dofControls.setDofBokehScale(lastDofBokehScale);
    displayColor = dofControls.isActive() ? dofControls.dofColor : sharpColor;
    aaOutput = useFxaa ? fxaa(displayColor) : displayColor;
    const nextOutput = ensureFsrWrapper(resolvePipelineColor());
    pipelineOutputNode = nextOutput;
    postProcessing.outputNode = pipelineOutputNode;
    postProcessing.needsUpdate = true;
  };

  graded = buildComposite()();
  const initialUseSmaa = aaEnabled && aaMethod === 'smaa';
  const initialUseFxaa = aaEnabled && aaMethod === 'fxaa';
  const gradedForDisplay = initialUseSmaa ? ensureSmaaOnGraded(graded) : graded;
  sharpColor = buildSharpColor(gradedForDisplay);
  dofControls = createDofControls(sharpColor, sceneViewZ);
  displayColor = dofControls.isActive() ? dofControls.dofColor : sharpColor;
  aaOutput = initialUseFxaa ? fxaa(displayColor) : displayColor;

  const initialOutput = ensureFsrWrapper(resolvePipelineColor());
  const postProcessing = new RenderPipeline(renderer, initialOutput);
  pipelineOutputNode = postProcessing.outputNode as TslNode;
  _activeRenderPipeline = postProcessing;
  postProcessing.outputColorTransform = false;

  const setAaEnabled = (enabled: boolean) => {
    aaEnabled = enabled;
  };

  const { applyGpuDebug, setDebugTargets } = createPostFxGpuDebug({
    bloomControls: {
      applyDebugWeight: () => bloomControls.applyDebugWeight(),
    },
    godraysControls: {
      applyWeight: () => godraysControls.applyWeight(),
    },
    gradeControls,
    setAaEnabled,
    getAaMethod: () => aaMethod,
    rebuildPipelineOutput: rebuildPostGraph,
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
    getBloomParams: () => bloomControls.getBloomParams(),
    setBloomParams: (params) => bloomControls.setBloomParams(params),
    resetBloomParams: () => bloomControls.resetBloomParams(),
    getGodraysParams: () => godraysControls.getGodraysParams(),
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
    setBloomSkyReduceFromSun: (elevationDeg) =>
      bloomControls.setBloomSkyReduceFromSun(elevationDeg),
    setGradeScalars: gradeControls.setGradeScalars,
    setGradeLut: gradeControls.setGradeLut,
    setDofFocus: (cam, focusWorld, delta) => {
      dofControls.setDofFocus(cam, focusWorld, delta);
    },
    setDofBokehScale: (scale) => {
      lastDofBokehScale = scale;
      dofControls.setDofBokehScale(scale);
    },
    getDofParams: () => dofControls.getDofParams(),
    setDofParams: (params: Partial<DofParams>) => {
      dofControls.updateParams(params);
      rebuildPostGraph();
    },
    resetDofParams: () => {
      dofControls.resetParams();
      rebuildPostGraph();
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
      rebuildPostGraph();
    },
    getAaMethod: () => aaMethod,
    setAaMethod: (method: AaMethod) => {
      if (aaMethod === method) return;
      aaMethod = method;
      rebuildPostGraph();
    },
    logGpuInfo: () => {
      gpuLog.logGpuInfo(devSettings.renderDebug);
    },
    rebuildPostPipeline: import.meta.env.DEV ? rebuildPostGraph : undefined,
  };
}

export function disposePostFxPipeline(): void {
  _activeRenderPipeline?.dispose();
  _activeRenderPipeline = null;
  _activeFsrNode?.dispose();
  _activeFsrNode = null;
  _activeSmaaNode?.dispose();
  _activeSmaaNode = null;
  disposeActiveGodrays();
  disposeActiveDof();
}
