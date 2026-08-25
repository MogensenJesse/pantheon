// src/editor/core/EditorRenderLoop.ts — editor animation loop (camera, lighting, tools, present)

import { type PointLight, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { profileBeginFrame, profileEndFrame, profileMark } from '../../dev/profiling';
import type { SceneContext } from '../../rendering/SceneSetup';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import { syncTerrainSplatLighting } from '../../world/terrain';
import type { EditorCameraContext } from './EditorCamera';

const editorPlayerPos = new Vector3(0, 4, 0);

export interface EditorRenderLoopDeps {
  setup: SceneContext;
  editorCam: EditorCameraContext;
  terrain: MapTerrainContext;
  editorPlayerLight: PointLight;
  tick: (dt: number) => void;
}

export interface EditorRenderLoop {
  run: () => void;
  dispose: () => void;
}

export function createEditorRenderLoop(deps: EditorRenderLoopDeps): EditorRenderLoop {
  const { setup, editorCam, terrain, editorPlayerLight, tick } = deps;
  const { renderer, scene, sun, ambientLight } = setup;
  let lastTime = performance.now();

  return {
    run: () => {
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        editorCam.update();

        syncTerrainSplatLighting(
          terrain.splatMaterial,
          editorPlayerPos,
          editorPlayerLight,
          sun,
          ambientLight,
          editorCam.camera,
        );

        tick(dt);

        profileBeginFrame();
        profileMark('editor');
        renderer.render(scene, editorCam.camera);
        profileEndFrame(renderer as WebGPURenderer);
      });
    },
    dispose: () => {
      renderer.setAnimationLoop(null);
    },
  };
}
