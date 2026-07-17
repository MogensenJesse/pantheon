// src/rendering/postfx/smaaChain.ts
// Bake color → SMAA multipass → silhouette resolve (morph + soft + short edge walk).
import type SMAANode from 'three/addons/tsl/display/SMAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { rtt } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import type { TslNode } from './depthAwareBlend.js';
import { ensureSmaaLookupTextures } from './ensureSmaaLookupTextures';
import { createSmaaSilhouetteResolveNode } from './smaaSilhouetteResolveTsl';

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
      inputRtt = rtt(colorNode) as TslNode;
      inputSource = colorNode;
    }
    if (!smaaNode || smaaSourceNode !== inputRtt) {
      disposeNode();
      outRtt = null;
      outSource = null;
      // inputRtt is already a TextureNode — smaa()'s convertToTexture returns it as-is.
      smaaNode = smaa(inputRtt);
      smaaSourceNode = inputRtt;
      ensureSmaaLookupTextures(smaaNode, renderer);
    }

    const smaaTex = smaaNode.getTextureNode() as unknown as TslNode;
    const internals = smaaNode as unknown as {
      _edgesTextureUniform: TslNode;
      _invSize: TslNode;
    };

    const edgeKey = smaaTex;
    if (!outRtt || outSource !== edgeKey) {
      outSource = edgeKey;
      outRtt = createSmaaSilhouetteResolveNode({
        smaaTex,
        edgesTex: internals._edgesTextureUniform,
        colorTex: inputRtt,
        invSize: internals._invSize,
      });
    }
    return outRtt;
  };

  return { ensure, dispose };
}
