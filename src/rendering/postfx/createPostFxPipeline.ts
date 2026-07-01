// src/rendering/postfx/createPostFxPipeline.ts — WebGPU RenderPipeline assembly
import type { DirectionalLight, PerspectiveCamera, Scene } from 'three';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { agxToneMapping, Fn, mix, pass, renderOutput, screenUV, uniform, vec4 } from 'three/tsl';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { PHASE0 } from '../../config/phase0';
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../PostFX';
import { bloomSkyAttenuation } from './bloomSkyMask';
import { createBloomControls } from './controls/bloomControls';
import { createDofControls, disposeActiveDof } from './controls/dofControls';
import { createGodraysControls, disposeActiveGodrays } from './controls/godraysControls';
import { createGradeControls } from './controls/gradeControls';
// Vendored depthAwareBlend (maskFn for god-ray sky mask) — see depthAwareBlend.js header.
import { depthAwareBlend } from './depthAwareBlend.js';
import type { DofParams } from './dofParams';
import { defaultGodraysParams, type GodraysParams } from './godraysParams';
import { createPostFxGpuDebug, type GpuDebugTargets } from './postfxDevDebug';
import { createPostFxGpuLogHooks } from './postfxGpuDebugLog';
import { applyLutGrade, applyProceduralPostGrade } from './postGrade';
import { applyVignette } from './vignetteEffect';

export type { GpuDebugTargets };

const { RENDER } = PHASE0;

let _activeRenderPipeline: RenderPipeline | null = null;

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

  let displayColor = dofControls.isActive() ? dofControls.dofColor : sharpColor;
  let aaOutput = fxaa(displayColor);
  let aaEnabled = !devSettings.renderDebug.disableAa;
  const postProcessing = new RenderPipeline(renderer, aaEnabled ? aaOutput : displayColor);
  _activeRenderPipeline = postProcessing;
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

  const { applyGpuDebug, setDebugTargets } = createPostFxGpuDebug({
    bloomControls,
    godraysControls,
    gradeControls,
    setAa,
    syncDofOutput,
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
      syncDofOutput();
    },
    resetDofParams: () => {
      dofControls.resetParams();
      syncDofOutput();
    },
    logGpuInfo: () => {
      gpuLog.logGpuInfo(devSettings.renderDebug);
    },
  };
}

export function disposePostFxPipeline(): void {
  _activeRenderPipeline?.dispose();
  _activeRenderPipeline = null;
  disposeActiveGodrays();
  disposeActiveDof();
}
