// src/dev/profiling/frameHooks.ts — cheap per-frame hooks for gameTick / editor
import type { WebGPURenderer } from 'three/webgpu';
import {
  beginPerformanceFrame,
  endPerformanceFrame,
  markPerformanceSection,
} from './PerformanceSuite';

export function profileBeginFrame(): void {
  if (!import.meta.env.DEV) return;
  beginPerformanceFrame();
}

export function profileMark(section: string): void {
  if (!import.meta.env.DEV) return;
  markPerformanceSection(section);
}

export function profileEndFrame(renderer: WebGPURenderer): void {
  if (!import.meta.env.DEV) return;
  endPerformanceFrame(renderer);
}
