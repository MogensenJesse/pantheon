// src/rendering/postfx/smaaChain.ts
// Bake color → SMAA multipass → silhouette resolve (morph + soft + short edge walk).
import type SMAANode from 'three/addons/tsl/display/SMAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { rtt } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import { ensureSmaaLookupTextures } from './ensureSmaaLookupTextures';
import { createSmaaSilhouetteResolveNode } from './smaaSilhouetteResolveTsl';
import type { TslNode } from './tslNode';

export type SmaaChain = {
  ensure: (colorNode: TslNode) => TslNode;
  dispose: () => void;
};

/** One independent SMAA + silhouette-resolve slot (pre-DoF and post-DoF each get their own). */
export function createSmaaChain(renderer: WebGPURenderer): SmaaChain {
  let smaaNode: SMAANode | null = null;
  let smaaSourceNode: TslNode | null = null;
  let inputRtt: TslNode | null = null;
  let inputSource: TslNode | null = null;
  let outRtt: TslNode | null = null;
  let outSource: TslNode | null = null;

  const disposeNode = () => {
    if (!smaaNode) return;
    smaaNode.dispose();
    smaaNode = null;
    smaaSourceNode = null;
  };

  const dispose = () => {
    disposeNode();
    inputRtt = null;
    inputSource = null;
    outRtt = null;
    outSource = null;
  };

  const ensure = (colorNode: TslNode): TslNode => {
    if (!inputRtt || inputSource !== colorNode) {
      dispose();
      if (!colorNode.name) colorNode.name = 'smaaInput';
      inputRtt = rtt(colorNode) as TslNode;
      inputSource = colorNode;
    }
    if (!smaaNode || smaaSourceNode !== inputRtt) {
      disposeNode();
      outRtt = null;
      outSource = null;
      // inputRtt is already a TextureNode — smaa()'s convertToTexture returns it as-is.
      smaaNode = smaa(inputRtt);
      Object.assign(smaaNode, { name: 'smaa' });
      smaaSourceNode = inputRtt;
      ensureSmaaLookupTextures(smaaNode, renderer);
      const smaaRts = smaaNode as SMAANode & {
        _renderTargetEdges?: { name?: string; texture?: { name?: string } };
        _renderTargetWeights?: { name?: string; texture?: { name?: string } };
        _renderTargetBlend?: { name?: string; texture?: { name?: string } };
      };
      for (const rt of [
        smaaRts._renderTargetEdges,
        smaaRts._renderTargetWeights,
        smaaRts._renderTargetBlend,
      ]) {
        if (rt?.texture?.name) rt.name = rt.texture.name;
      }
    }

    const smaaTex = smaaNode.getTextureNode() as unknown as TslNode;
    const internals = smaaNode as unknown as {
      _edgesTextureUniform: TslNode;
      _invSize: TslNode;
    };

    const edgeKey = smaaTex;
    if (!outRtt || outSource !== edgeKey) {
      outSource = edgeKey;
      const resolve = createSmaaSilhouetteResolveNode({
        smaaTex,
        edgesTex: internals._edgesTextureUniform,
        colorTex: inputRtt,
        invSize: internals._invSize,
      });
      resolve.name = 'smaaSilhouette';
      outRtt = resolve;
    }
    return outRtt;
  };

  return { ensure, dispose };
}
