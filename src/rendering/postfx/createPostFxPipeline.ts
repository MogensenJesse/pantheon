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
import { createDofGatedFxaaNode } from './dofGatedFxaaTsl';
import type { DofParams } from './dofParams';
import {
  createEffectGraphBypassGate,
  EFFECT_BYPASS_ON_EPS,
  type EffectGraphBypassState,
} from './effectGraphBypass';
import { defaultGodraysParams, type GodraysParams } from './godraysParams';
import { createPostFxGpuDebug, type GpuDebugTargets } from './postfxDevDebug';
import { createPostFxGpuLogHooks } from './postfxGpuDebugLog';
import { applyLutGrade, applyProceduralPostGrade } from './postGrade';
import { createSmaaChain, type SmaaChain } from './smaaChain';
import { applyVignette } from './vignetteEffect';

export type { GpuDebugTargets };

const { render: RENDER } = VISUAL;

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

  const buildComposite = (withGodrays: boolean, withBloom: boolean) =>
    Fn(() => {
      const uv = screenUV;

      const baseSample = sceneBeauty.sample(uv);
      let sceneRgb = baseSample.rgb;
      // Unreferenced GodraysNode / bilateral blur are skipped by RenderPipeline.
      if (withGodrays) {
        const withRaysSample = depthAwareBlend(
          sceneBeauty,
          godraysControls.godraysBlur.getTextureNode(),
          sceneDepth,
          camera,
          godraysControls.godraysBlendOptions,
        );
        sceneRgb = mix(sceneRgb, withRaysSample.rgb, godraysControls.uGodRaysWeight);
      }
      let bloomed = sceneRgb;
      // Unreferenced BloomNode mip chain is skipped by RenderPipeline.
      if (withBloom) {
        const sceneDepthSample = sceneDepth.sample(uv).r;
        const bloomAdd = bloomControls.bloomScene
          .mul(bloomControls.uSceneBloomWeight)
          .mul(
            bloomSkyAttenuation(
              baseSample.rgb,
              sceneDepthSample,
              bloomControls.bloomSkyMaskUniforms,
            ),
          );
        bloomed = sceneRgb.add(bloomAdd);
      }
      const toned = agxToneMapping(bloomed, uExposure);
      const color = applyVignette(toned, uv, uVignetteInner, uVignetteDarkness, uVignetteEnabled);

      return vec4(color, baseSample.a);
    });

  // Stable composite identities — reconnect reuses these instead of buildComposite()() each time.
  const compositeByKey = {
    '0_0': buildComposite(false, false)(),
    '0_1': buildComposite(false, true)(),
    '1_0': buildComposite(true, false)(),
    '1_1': buildComposite(true, true)(),
  } as const;
  type CompositeKey = keyof typeof compositeByKey;
  const pickComposite = (withGodrays: boolean, withBloom: boolean): TslNode =>
    compositeByKey[`${withGodrays ? 1 : 0}_${withBloom ? 1 : 0}` as CompositeKey];

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
  // Pre-DoF SMAA (working color). Post-DoF FXAA is CoC-gated when SMAA is selected
  // so in-focus pixels stay sharp (a second SMAA multipass blanked the frame).
  const smaaPre = createSmaaChain(renderer);
  _activeSmaaChains = [smaaPre];
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

  const disposeSmaaBake = () => {
    smaaPre.dispose();
  };

  const resolvePipelineColor = (): TslNode => {
    if (!aaEnabled || aaMethod === 'off') {
      disposeSmaaBake();
      return displayColor;
    }
    if (aaMethod !== 'smaa') disposeSmaaBake();
    return aaOutput;
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

  /** FXAA after DoF: full-frame for FXAA method; CoC-gated full-res for SMAA (keep in-focus sharp). */
  const resolveAaAfterDisplay = (
    useSmaa: boolean,
    useFxaa: boolean,
    color: TslNode,
    dof: ReturnType<typeof createDofControls>,
  ): TslNode => {
    if (useFxaa) return fxaa(color);
    if (useSmaa && dof.isActive()) {
      // Full-res FXAA — DoF bokeh is half-res; this pass cleans upscale jaggies in blur.
      return createDofGatedFxaaNode({
        sharpColor: color,
        fxaaColor: fxaa(color),
        sceneViewZ,
        uFocusDistance: dof.uFocusDistance as TslNode,
        uFocalLength: dof.uFocalLength as TslNode,
      });
    }
    return color;
  };

  const rebuildPostGraph = () => {
    applySceneResolutionScale();
    graded = pickComposite(effectBypass.state.withGodrays, effectBypass.state.withBloom);
    const useSmaa = aaEnabled && aaMethod === 'smaa';
    const useFxaa = aaEnabled && aaMethod === 'fxaa';
    // SMAA before DoF so beauty / CoC taps are anti-aliased.
    if (!useSmaa) smaaPre.dispose();
    const gradedForSharp = useSmaa ? smaaPre.ensure(graded) : graded;
    sharpColor = buildSharpColor(gradedForSharp);
    disposeActiveDof();
    dofControls = createDofControls(sharpColor, sceneViewZ);
    dofControls.setDofBokehScale(lastDofBokehScale);
    // Unreferenced DepthOfFieldNode is skipped by RenderPipeline (DEV disable DoF).
    displayColor = dofControls.isActive() ? dofControls.dofColor : sharpColor;
    aaOutput = resolveAaAfterDisplay(useSmaa, useFxaa, displayColor, dofControls);
    const nextOutput = ensureFsrWrapper(resolvePipelineColor());
    pipelineOutputNode = nextOutput;
    postProcessing.outputNode = pipelineOutputNode;
    postProcessing.needsUpdate = true;
  };

  // Night start: god rays off (sun intensity 0). Bloom stays on (emissive orbs / cohesion).
  // Graph variants are precompiled via `warmupEffectGraphs` (Phase 6.1) behind the loading screen.
  // Wiring changes are queued in sync and flushed in render (avoids CSS-background flash on reconnect).
  // Bypass uses sun intensity (not horizon-gated mix weight) so daytime occlusion only zeros the
  // blend — the graph stays hot and clearing a ridge does not pay a reconnect hitch/flash.
  const effectBypass = createEffectGraphBypassGate({
    getGodraysWeight: () => {
      const mixW = godraysControls.getEffectiveWeight();
      if (mixW > EFFECT_BYPASS_ON_EPS) return mixW;
      const sunI = godraysControls.getLastSunState().intensity;
      // Keep connected whenever the sun is up enough to cast shafts; mix weight may still be 0.
      return sunI > 0.05 ? EFFECT_BYPASS_ON_EPS + 0.001 : mixW;
    },
    getBloomWeight: () => bloomControls.getEffectiveWeight(),
    rebuild: () => rebuildPostGraph(),
    initial: { withGodrays: false, withBloom: true },
  });

  graded = pickComposite(false, true);
  const initialUseSmaa = aaEnabled && aaMethod === 'smaa';
  const initialUseFxaa = aaEnabled && aaMethod === 'fxaa';
  const gradedForSharp = initialUseSmaa ? smaaPre.ensure(graded) : graded;
  sharpColor = buildSharpColor(gradedForSharp);
  dofControls = createDofControls(sharpColor, sceneViewZ);
  dofControls.setDofBokehScale(lastDofBokehScale);
  displayColor = dofControls.isActive() ? dofControls.dofColor : sharpColor;
  aaOutput = resolveAaAfterDisplay(initialUseSmaa, initialUseFxaa, displayColor, dofControls);

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
    postProcessing.render();
    if (flush.rebuilt) {
      // Second present fills newly referenced effect RTs before RAF yields.
      postProcessing.render();
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
      const last = godraysControls.getLastSunState();
      const elevAbove = last.elevationDeg - last.horizonElevationDeg;
      const depthTex = sunLight.shadow.map?.depthTexture ?? null;
      const compare = depthTex?.compareFunction ?? null;
      const live = godraysControls.getLiveDensity();
      const horizonDisabled = last.horizonElevationDeg <= -89.5;
      console.info('[godrays diagnose]', {
        mixWeight: godraysControls.getEffectiveWeight(),
        uGodRaysWeight: godraysControls.uGodRaysWeight.value,
        graphWithGodrays: effectBypass.state.withGodrays,
        sunIntensity: last.intensity,
        elevationDeg: last.elevationDeg,
        horizonElevationDeg: last.horizonElevationDeg,
        elevAboveHorizonDeg: elevAbove,
        horizonOcclusion: horizonDisabled ? 'DEV-off (-90 sentinel)' : 'on',
        liveDensity: live.density,
        liveMaxDensity: live.maxDensity,
        params: godraysControls.getGodraysParams(),
        sunCastShadow: sunLight.castShadow,
        shadowMap: sunLight.shadow.map
          ? `${sunLight.shadow.mapSize.x}x${sunLight.shadow.mapSize.y}`
          : null,
        depthCompareFunction: compare,
        usePcss: VISUAL.shadows.lighting.usePcss,
        useSoftShadowMap: VISUAL.shadows.lighting.useSoftShadowMap,
        shadowSample: godraysControls.getShadowSampleMode(),
        directional: godraysControls.getDirectionalDiagnose?.() ?? null,
        shadowCameraCoordinateSystem: sunLight.shadow.camera.coordinateSystem,
        hint:
          compare === null &&
          godraysControls.getShadowSampleMode() === 'directionalDepthCompare'
            ? 'depth compareFunction is null — cannot cut shafts'
            : horizonDisabled
              ? 'horizon occlusion DEV-off — not blocking; Disable haze to isolate shafts'
              : elevAbove < 0
                ? 'sun below terrain silhouette — weight/density gated off'
                : !effectBypass.state.withGodrays
                  ? 'god-rays graph disconnected (bypass)'
                  : 'directional shafts — look toward sun through trees; Disable haze to isolate',
      });
    },
    /**
     * Compile each god-rays × bloom graph variant with a throwaway render (startup only).
     * Restores the night-start wiring afterward.
     */
    warmupEffectGraphs: () => {
      // Bind PCSS color-depth / live depth texture before GodraysNode.setup() picks sampler type.
      godraysControls.prepareShadowSampling();
      const restore: EffectGraphBypassState = {
        withGodrays: effectBypass.state.withGodrays,
        withBloom: effectBypass.state.withBloom,
      };
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
      effectBypass.setWiring(restore);
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
