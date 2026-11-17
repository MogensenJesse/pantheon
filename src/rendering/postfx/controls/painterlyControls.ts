// src/rendering/postfx/controls/painterlyControls.ts — screen-space painterly pass (anisotropic Kuwahara + canvas grain)
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { clamp, Fn, mix, rtt, screenCoordinate, screenUV, uniform, vec3, vec4 } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { anisotropicKuwahara, canvasGrain, structureTensor } from '../painterlyKuwaharaTsl';
import type { TslNode } from '../tslNode';

export interface PainterlyParams {
  enabled: boolean;
  strength: number;
  radius: number;
  anisotropy: number;
  hardness: number;
  sharpness: number;
  grain: number;
  resolutionScale: number;
}

export const defaultPainterlyParams = (): PainterlyParams => ({ ...VISUAL.postfx.painterly });

/** Structure tensor smoothing, in tensor-RT pixels. Not live: the blur kernel is fixed at graph build. */
const TENSOR_SIGMA = 2;
const TENSOR_SCALE = 0.5;

type RttHandle = ReturnType<typeof rtt> & {
  node: unknown;
  _rttNode?: unknown;
  textureNeedsUpdate?: boolean;
  _quadMesh?: { material: { needsUpdate: boolean } };
  setResolutionScale: (scale: number) => void;
  dispose: () => void;
};

export function createPainterlyControls() {
  let params = defaultPainterlyParams();
  const uStrength = uniform(params.strength);
  const uRadius = uniform(params.radius);
  const uAnisotropy = uniform(params.anisotropy);
  const uHardness = uniform(params.hardness);
  const uSharpness = uniform(params.sharpness);
  const uGrain = uniform(params.grain);

  let srcRtt: RttHandle | null = null;
  let filterRtt: RttHandle | null = null;
  let tensorRtt: RttHandle | null = null;
  let blur: { dispose: () => void } | null = null;
  let output: TslNode | null = null;

  const toInput = (sharp: TslNode) => Fn(() => vec4(clamp(sharp.rgb, vec3(0), vec3(1)), 1))();

  const build = (input: TslNode): TslNode => {
    const src = rtt(input) as RttHandle;
    src.name = 'painterlySrc';
    const tensor = rtt(structureTensor(src)) as RttHandle;
    tensor.setResolutionScale(TENSOR_SCALE);
    const blurNode = gaussianBlur(tensor, null, TENSOR_SIGMA);
    const filter = rtt(
      anisotropicKuwahara(src, blurNode.getTextureNode(), {
        radius: uRadius,
        anisotropy: uAnisotropy,
        hardness: uHardness,
        sharpness: uSharpness,
      }),
    ) as RttHandle;
    filter.name = 'painterlyKuwahara';
    filter.setResolutionScale(params.resolutionScale);
    srcRtt = src;
    tensorRtt = tensor;
    blur = blurNode;
    filterRtt = filter;
    // Re-read the source RTT instead of `sharp` so this node survives graph rebuilds unchanged.
    return Fn(() => {
      const base = src.sample(screenUV).rgb;
      const painted = filter
        .sample(screenUV)
        .rgb.mul(canvasGrain(screenCoordinate).mul(uGrain).add(1));
      return vec4(mix(base, painted, uStrength), 1);
    })();
  };

  /** Returns true when the graph must be rebuilt (enabled flipped). */
  const updateParams = (next: Partial<PainterlyParams>): boolean => {
    const wasEnabled = params.enabled;
    params = { ...params, ...next };
    uStrength.value = params.strength;
    uRadius.value = params.radius;
    uAnisotropy.value = params.anisotropy;
    uHardness.value = params.hardness;
    uSharpness.value = params.sharpness;
    uGrain.value = params.grain;
    filterRtt?.setResolutionScale(params.resolutionScale);
    return params.enabled !== wasEnabled;
  };

  return {
    /** Wrap the display-referred sharp colour. Returns `sharp` untouched while disabled (zero cost). */
    apply: (sharp: TslNode): TslNode => {
      if (!params.enabled) return sharp;
      const input = toInput(sharp);
      if (output && srcRtt) {
        // Same rebind DoF uses: swap the RTT source without recreating (and leaking) render targets.
        srcRtt.node = input;
        srcRtt._rttNode = input;
        srcRtt.textureNeedsUpdate = true;
        if (srcRtt._quadMesh) srcRtt._quadMesh.material.needsUpdate = true;
        return output;
      }
      output = build(input);
      return output;
    },
    getParams: (): PainterlyParams => ({ ...params }),
    updateParams,
    resetParams: (): boolean => updateParams(defaultPainterlyParams()),
    dispose: () => {
      blur?.dispose();
      for (const r of [filterRtt, tensorRtt, srcRtt]) r?.dispose();
      srcRtt = tensorRtt = filterRtt = null;
      blur = null;
      output = null;
    },
  };
}
