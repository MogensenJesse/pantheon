// src/editor/core/editorAgxPresent.ts — editor present: scene HDR → AgX → display

import type { PerspectiveCamera, Scene } from 'three';
import { agxToneMapping, Fn, pass, renderOutput, screenUV, uniform, vec4 } from 'three/tsl';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import type { TslNode } from '../../rendering/postfx/tslNode';

export interface EditorAgxPresent {
  setExposure: (value: number) => void;
  render: () => void;
  dispose: () => void;
}

/** AgX only. Bloom, grade, and depth of field stay on the play pipeline. */
export function createEditorAgxPresent(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): EditorAgxPresent {
  const beauty = pass(scene, camera).getTextureNode('output');
  const uExposure = uniform(VISUAL.sky.lighting.noon.globalExposure);
  const outputNode = Fn(() => {
    const hdr = beauty.sample(screenUV).rgb as TslNode;
    const toned = agxToneMapping(hdr, uExposure as TslNode) as TslNode;
    const display = renderOutput(vec4(toned, 1)) as TslNode;
    return vec4(display.rgb, 1);
  })();

  const pipeline = new RenderPipeline(renderer, outputNode);
  pipeline.outputColorTransform = false;

  return {
    setExposure: (value) => {
      uExposure.value = value;
    },
    render: () => {
      pipeline.render();
    },
    dispose: () => {
      pipeline.dispose();
    },
  };
}
