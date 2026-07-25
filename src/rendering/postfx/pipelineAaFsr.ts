// src/rendering/postfx/pipelineAaFsr.ts — SMAA/FXAA after DoF + optional FSR1 upscale
import type FSR1Node from 'three/addons/tsl/display/FSR1Node.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { rtt } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import type { AaMethod, UpscalingSettings } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import type { createDofControls } from './controls/dofControls';
import type { TslNode } from './depthAwareBlend.js';
import { createDofGatedFxaaNode } from './dofGatedFxaaTsl';
import { createSmaaChain, type SmaaChain } from './smaaChain';

type DofControls = ReturnType<typeof createDofControls>;
type ScalarUniform = ReturnType<typeof import('three/tsl').uniform>;

export interface PipelineAaFsrDeps {
  renderer: WebGPURenderer;
  sceneViewZ: TslNode;
  getUpscalingState: () => UpscalingSettings;
  getAaMethod: () => AaMethod;
  getAaEnabled: () => boolean;
  uFsrSharpness: ScalarUniform;
  uFsrDenoise: ScalarUniform;
  onFsrNodeChanged: (node: FSR1Node | null) => void;
  onSmaaChainsChanged: (chains: SmaaChain[]) => void;
}

export function createPipelineAaFsr(deps: PipelineAaFsrDeps) {
  const {
    renderer,
    sceneViewZ,
    getUpscalingState,
    getAaMethod,
    getAaEnabled,
    uFsrSharpness,
    uFsrDenoise,
    onFsrNodeChanged,
    onSmaaChainsChanged,
  } = deps;

  let lowResRtt: RttNodeWithResolutionScale | null = null;
  let lowResSourceNode: TslNode | null = null;
  let fsrNode: FSR1Node | null = null;
  let fsrSourceNode: TslNode | null = null;
  const smaaPre = createSmaaChain(renderer);
  onSmaaChainsChanged([smaaPre]);

  const getUpscalingScale = () => {
    const upscalingState = getUpscalingState();
    if (!upscalingState.enabled) return 1;
    return upscalingState.resolutionScale;
  };

  const shouldUseFsr = () => {
    const scale = getUpscalingScale();
    if (import.meta.env.DEV && devSettings.renderDebug.disableFsr) return false;
    return scale < 1 && getUpscalingState().method === 'fsr1';
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
    onFsrNodeChanged(null);
  };

  const disposeSmaaBake = () => {
    smaaPre.dispose();
  };

  const resolvePipelineColor = (displayColor: TslNode, aaOutput: TslNode): TslNode => {
    if (!getAaEnabled() || getAaMethod() === 'off') {
      disposeSmaaBake();
      return displayColor;
    }
    if (getAaMethod() !== 'smaa') disposeSmaaBake();
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
    onFsrNodeChanged(fsrNode);
    return fsrNode as TslNode;
  };

  /** FXAA after DoF: full-frame for FXAA method; CoC-gated full-res for SMAA (keep in-focus sharp). */
  const resolveAaAfterDisplay = (
    useSmaa: boolean,
    useFxaa: boolean,
    color: TslNode,
    dof: DofControls,
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

  return {
    smaaPre,
    disposeSmaaBake,
    disposeFsrNode,
    resolvePipelineColor,
    ensureFsrWrapper,
    resolveAaAfterDisplay,
  };
}
