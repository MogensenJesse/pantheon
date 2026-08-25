// src/editor/core/EditorViewportFit.ts — size WebGPU drawing buffer from the canvas layout box

import type { PerspectiveCamera } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

export function bindEditorViewport(
  canvas: HTMLCanvasElement,
  renderer: WebGPURenderer,
  camera: PerspectiveCamera,
): () => void {
  const fit = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const observer = new ResizeObserver(fit);
  observer.observe(canvas);
  fit();
  return () => observer.disconnect();
}
