// src/rendering/sunShadow/configureSunShadowFilter.ts — WebGPU shadow filter setup
import { PCFShadowMap } from 'three';
import { PCFShadowFilter, PCFSoftShadowFilter } from 'three/tsl';
import type { DirectionalLight, WebGPURenderer } from 'three/webgpu';
import type { SunShadowFilterMode } from '../../config/visualTuning';

type SunShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof PCFShadowFilter | typeof PCFSoftShadowFilter;
};

/**
 * WebGPU TSL shadow filter selection.
 * Soft: smooth 9-tap gather (r184 look) — shadow.radius has no effect.
 * Vogel: radius-aware PCF disk — dev PCF radius slider widens the filter.
 */
export function configureSunShadowFilter(
  renderer: WebGPURenderer,
  sun: DirectionalLight,
  mode: SunShadowFilterMode,
): void {
  renderer.shadowMap.type = PCFShadowMap;
  (sun.shadow as SunShadowWithFilter).filterNode =
    mode === 'soft' ? PCFSoftShadowFilter : PCFShadowFilter;
}
