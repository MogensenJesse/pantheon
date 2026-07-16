// src/rendering/sunShadow/configureSunShadowFilter.ts — WebGPU shadow filter setup
import { PCFShadowMap } from 'three';
import { PCFSoftShadowFilter } from 'three/tsl';
import type { DirectionalLight, WebGPURenderer } from 'three/webgpu';
import type { SunShadowFilterMode } from '../../config/visualTuning';
import { WidePCFShadowFilter } from './widePcfShadowFilter';

type SunShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof WidePCFShadowFilter | typeof PCFSoftShadowFilter;
};

/**
 * WebGPU TSL shadow filter selection.
 * Soft: smooth 9-tap gather (r184 look) — shadow.radius has no effect.
 * Vogel: wide radius-aware Vogel PCF — PCF radius slider widens the penumbra.
 */
export function configureSunShadowFilter(
  renderer: WebGPURenderer,
  sun: DirectionalLight,
  mode: SunShadowFilterMode,
): void {
  renderer.shadowMap.type = PCFShadowMap;
  (sun.shadow as SunShadowWithFilter).filterNode =
    mode === 'soft' ? PCFSoftShadowFilter : WidePCFShadowFilter;
}
