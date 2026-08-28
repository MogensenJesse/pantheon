// src/optimizer/pipeline/directOffscreen.ts — offscreen RT passes without canvas scissor/FBT mismatch
import { Vector2, Vector4 } from 'three';
import type { RenderTarget, WebGPURenderer } from 'three/webgpu';

/**
 * Size the internal color-transform buffer to `target` instead of the canvas.
 * `setRenderTarget` alone still composites through a canvas-sized buffer, which
 * reads back as uninitialized noise after a split-view scissor.
 */
export function bindOffscreenTarget(renderer: WebGPURenderer, target: RenderTarget): () => void {
  const prevOut = renderer.getOutputRenderTarget();
  const prevRt = renderer.getRenderTarget();
  target.viewport.set(0, 0, target.width, target.height);
  target.scissor.set(0, 0, target.width, target.height);
  target.scissorTest = false;
  renderer.setOutputRenderTarget(target);
  renderer.setRenderTarget(target);
  return () => {
    renderer.setRenderTarget(prevRt);
    renderer.setOutputRenderTarget(prevOut);
  };
}

/** Isolate canvas viewport/scissor while the studio animation loop is paused. */
export async function withDirectOffscreen<T>(
  renderer: WebGPURenderer,
  fn: () => Promise<T>,
): Promise<T> {
  const prevOut = renderer.getOutputRenderTarget();
  const prevRt = renderer.getRenderTarget();
  const prevVp = new Vector4();
  const prevSc = new Vector4();
  renderer.getViewport(prevVp);
  renderer.getScissor(prevSc);
  const prevScissorTest = renderer.getScissorTest();
  const css = new Vector2();
  renderer.getSize(css);

  renderer.setOutputRenderTarget(null);
  renderer.setRenderTarget(null);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, css.x, css.y);
  renderer.setScissor(0, 0, css.x, css.y);

  try {
    return await fn();
  } finally {
    renderer.setRenderTarget(prevRt);
    renderer.setOutputRenderTarget(prevOut);
    renderer.setViewport(prevVp);
    renderer.setScissor(prevSc);
    renderer.setScissorTest(prevScissorTest);
  }
}
