// src/optimizer/scene/splitViewport.ts — one WebGPURenderer, scissor split, shared camera
import type { StudioContext } from './studioScene';

export function renderSplitViews(
  studio: StudioContext,
  split: number,
  width: number,
  height: number,
): void {
  const { renderer, scene, camera, originalRoot, optimizedRoot } = studio;
  // WebGPURenderer.setViewport / setScissor take logical (CSS) pixels, not device pixels.
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const xSplit = Math.round(Math.min(0.92, Math.max(0.08, split)) * w);
  const leftW = Math.max(1, xSplit);
  const rightW = Math.max(1, w - xSplit);

  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);

  originalRoot.visible = true;
  optimizedRoot.visible = false;
  camera.aspect = leftW / h;
  camera.updateProjectionMatrix();
  renderer.setViewport(0, 0, leftW, h);
  renderer.setScissor(0, 0, leftW, h);
  renderer.render(scene, camera);

  originalRoot.visible = false;
  optimizedRoot.visible = true;
  camera.aspect = rightW / h;
  camera.updateProjectionMatrix();
  renderer.setViewport(leftW, 0, rightW, h);
  renderer.setScissor(leftW, 0, rightW, h);
  renderer.render(scene, camera);

  originalRoot.visible = true;
  optimizedRoot.visible = true;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
}

export function attachSplitDrag(
  handle: HTMLElement,
  host: HTMLElement,
  getSplit: () => number,
  setSplit: (value: number) => void,
): () => void {
  let dragging = false;
  const clamp01 = (v: number) => Math.min(0.9, Math.max(0.1, v));
  const onDown = (event: PointerEvent) => {
    dragging = true;
    handle.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent) => {
    if (!dragging) return;
    const rect = host.getBoundingClientRect();
    setSplit(clamp01((event.clientX - rect.left) / Math.max(1, rect.width)));
  };
  const onUp = () => {
    dragging = false;
  };
  const onKey = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 0.05 : 0.02;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSplit(clamp01(getSplit() - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSplit(clamp01(getSplit() + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSplit(0.1);
    } else if (event.key === 'End') {
      event.preventDefault();
      setSplit(0.9);
    }
  };
  handle.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  handle.addEventListener('keydown', onKey);
  return () => {
    handle.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    handle.removeEventListener('keydown', onKey);
  };
}
