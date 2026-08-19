// src/rendering/postfx/createPostFxPipeline.ts — WebGPU RenderPipeline assembly
import type { DirectionalLight, PerspectiveCamera, Scene } from 'three';
import type FSR1Node from 'three/addons/tsl/display/FSR1Node.js';
import { pass, uniform, vec4 } from 'three/tsl';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { type AaMethod, type UpscalingSettings, VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../PostFX';
import { createBloomControls } from './controls/bloomControls';
import { createDofControls, disposeActiveDof } from './controls/dofControls';
import { createGodraysControls, disposeActiveGodrays } from './controls/godraysControls';
import { createGradeControls } from './controls/gradeControls';
import type { TslNode } from './depthAwareBlend.js';
import type { DofParams } from './dofParams';
import { createEffectGraphBypassGate, type EffectGraphBypassState } from './effectGraphBypass';
import { logGodraysDiagnose } from './godraysDiagnoseLog';
import { defaultGodraysParams, type GodraysParams } from './godraysParams';
import { getLiveMsaaSamples } from './msaaDevOverride';
import { createPipelineAaFsr } from './pipelineAaFsr';
import { createPipelineComposite } from './pipelineComposite';
import { createPostFxGpuDebug, type GpuDebugTargets } from './postfxDevDebug';
import { createPostFxGpuLogHooks } from './postfxGpuDebugLog';
import type { SmaaChain } from './smaaChain';

export type { GpuDebugTargets };

const { render: RENDER } = VISUAL;

/** DoF / SMAA can emit alpha 0 (cleared CoC RTs). Opaque present so page CSS cannot show through. */
const forceOpaquePresent = (color: TslNode) => vec4((color as { rgb: TslNode }).rgb, 1);

let _activeRenderPipeline: RenderPipeline | null = null;
let _activeFsrNode: FSR1Node | null = null;
let _activeSmaaChains: SmaaChain[] = [];

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

  const scenePass = pass(scene, camera, { samples: getLiveMsaaSamples() });
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

  const uExposure = uniform(Number(VISUAL.sky.exposureCurve.groundHigh));
  const uVignetteInner = uniform(0.3);
  const uVignetteDarkness = uniform(0.95);
  const uVignetteEnabled = uniform(1);

  let lastVignetteEnergyRatio = 0;
  let cohesionVignetteDarknessMul = 1;

  const { pickComposite, buildSharpColor } = createPipelineComposite({
    sceneBeauty,
    sceneDepth,
    camera,
    bloomControls,
    godraysControls,
    gradeControls,
    uExposure,
    uVignetteInner,
    uVignetteDarkness,
    uVignetteEnabled,
  });

  let lastDofBokehScale: number = VISUAL.dof.BOKEH_SCALE_START;

  const uFsrSharpness = uniform(upscalingState.sharpness);
  const uFsrDenoise = uniform(upscalingState.denoise);

  const aaFsr = createPipelineAaFsr({
    renderer,
    sceneViewZ,
    getUpscalingState: () => upscalingState,
    getAaMethod: () => aaMethod,
    getAaEnabled: () => aaEnabled,
    uFsrSharpness,
    uFsrDenoise,
    onFsrNodeChanged: (node) => {
      _activeFsrNode = node;
    },
    onSmaaChainsChanged: (chains) => {
      _activeSmaaChains = chains;
    },
  });

  let pipelineOutputNode: TslNode | null = null;

  let graded: TslNode;
  let sharpColor: TslNode;
  let dofControls: ReturnType<typeof createDofControls>;
  let displayColor: TslNode;
  let aaOutput: TslNode;

  const rebuildPostGraph = () => {
    applySceneResolutionScale();
    graded = pickComposite(effectBypass.state.withGodrays, effectBypass.state.withBloom);
    const useSmaa = aaEnabled && aaMethod === 'smaa';
    const useFxaa = aaEnabled && aaMethod === 'fxaa';
    // SMAA before DoF so beauty / CoC taps are anti-aliased.
    if (!useSmaa) aaFsr.disposeSmaaBake();
    const gradedForSharp = useSmaa ? aaFsr.smaaPre.ensure(graded) : graded;
    sharpColor = buildSharpColor(gradedForSharp);
    if (dofControls) {
      dofControls.rebindSharp(sharpColor);
    } else {
      dofControls = createDofControls(sharpColor, sceneViewZ);
    }
    dofControls.setDofBokehScale(lastDofBokehScale);
    // Unreferenced DepthOfFieldNode is skipped by RenderPipeline (DEV disable DoF).
    displayColor = dofControls.isActive() ? dofControls.dofColor : sharpColor;
    aaOutput = aaFsr.resolveAaAfterDisplay(useSmaa, useFxaa, displayColor, dofControls);
    const nextOutput = forceOpaquePresent(
      aaFsr.ensureFsrWrapper(aaFsr.resolvePipelineColor(displayColor, aaOutput)),
    );
    pipelineOutputNode = nextOutput;
    postProcessing.outputNode = pipelineOutputNode;
    postProcessing.needsUpdate = true;
  };

  // Night starts with god rays disconnected; warmup compiles all variants then leaves
  // them wired (mix weight 0) so dawn does not rebuild the post graph.
  const effectBypass = createEffectGraphBypassGate({
    getGodraysWeight: () => godraysControls.getEffectiveWeight(),
    getBloomWeight: () => bloomControls.getEffectiveWeight(),
    rebuild: () => rebuildPostGraph(),
    initial: { withGodrays: false, withBloom: true },
  });

  graded = pickComposite(false, true);
  const initialUseSmaa = aaEnabled && aaMethod === 'smaa';
  const initialUseFxaa = aaEnabled && aaMethod === 'fxaa';
  const gradedForSharp = initialUseSmaa ? aaFsr.smaaPre.ensure(graded) : graded;
  sharpColor = buildSharpColor(gradedForSharp);
  dofControls = createDofControls(sharpColor, sceneViewZ);
  dofControls.setDofBokehScale(lastDofBokehScale);
  displayColor = dofControls.isActive() ? dofControls.dofColor : sharpColor;
  aaOutput = aaFsr.resolveAaAfterDisplay(initialUseSmaa, initialUseFxaa, displayColor, dofControls);

  const initialOutput = forceOpaquePresent(
    aaFsr.ensureFsrWrapper(aaFsr.resolvePipelineColor(displayColor, aaOutput)),
  );
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
    syncEffectBypass: () => effectBypass.sync(),
    applyDevEffectBypassFlags: (flags) =>
      effectBypass.forceOff({
        godrays: flags.forceGodraysOff,
        bloom: flags.forceBloomOff,
      }),
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
      effectBypass.sync();
    }
  };

  const presentFrame = () => {
    // Flush queued god-rays/bloom wiring, then present. On god-rays reconnect, keep the
    // mix weight at 0 for a couple of frames while GodraysNode + blur RTs fill — otherwise
    // the first present blends stale/empty shaft data (Phase 3.1 flash).
    const flush = effectBypass.flushPending();
    if (flush.godraysReconnected) {
      godraysControls.beginReconnectWarmup(2);
    }
    // If the output quad skips draw (pipeline compiling after rebuild), keep the last
    // present instead of clearing the swapchain to black.
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      postProcessing.render();
      if (flush.rebuilt) {
        // Second present fills newly referenced effect RTs before RAF yields.
        postProcessing.render();
      }
    } finally {
      renderer.autoClear = prevAutoClear;
    }
    godraysControls.tickReconnectWarmup();
  };

  return {
    render: import.meta.env.DEV
      ? () => {
          applyGpuDebug();
          presentFrame();
          gpuLog.maybeLogPeriodic(devSettings.renderDebug);
        }
      : () => {
          presentFrame();
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
        effectBypass.sync();
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
    setBloomParams: (params) => {
      bloomControls.setBloomParams(params);
      effectBypass.sync();
    },
    resetBloomParams: () => {
      bloomControls.resetBloomParams();
      effectBypass.sync();
    },
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
    logGodraysDiagnose: (sunLight: DirectionalLight) => {
      logGodraysDiagnose(sunLight, godraysControls, effectBypass);
    },
    /**
     * Compile each god-rays × bloom graph variant with a throwaway render (startup only).
     * Leaves god rays wired (weight 0 at night) so dawn does not rebuild/compile the post graph.
     */
    warmupEffectGraphs: () => {
      // Bind PCSS color-depth / live depth texture before GodraysNode.setup() picks sampler type.
      godraysControls.prepareShadowSampling();
      const bloomOn = effectBypass.state.withBloom;
      const variants: EffectGraphBypassState[] = [
        { withGodrays: false, withBloom: true },
        { withGodrays: true, withBloom: true },
        { withGodrays: false, withBloom: false },
        { withGodrays: true, withBloom: false },
      ];
      for (const variant of variants) {
        effectBypass.setWiring(variant);
        effectBypass.flushPending();
        postProcessing.render();
      }
      effectBypass.setWiring({ withGodrays: true, withBloom: bloomOn });
      effectBypass.flushPending();
      postProcessing.render();
    },
    rebuildPostPipeline: import.meta.env.DEV ? rebuildPostGraph : undefined,
  };
}

export function disposePostFxPipeline(): void {
  _activeRenderPipeline?.dispose();
  _activeRenderPipeline = null;
  _activeFsrNode?.dispose();
  _activeFsrNode = null;
  for (const chain of _activeSmaaChains) chain.dispose();
  _activeSmaaChains = [];
  disposeActiveGodrays();
  disposeActiveDof();
}
