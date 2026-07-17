// src/rendering/sunShadow/configureSunShadowFilter.ts — WebGPU shadow filter setup
import { PCFShadowMap } from 'three';
import { PCFSoftShadowFilter } from 'three/tsl';
import type { DirectionalLight, WebGPURenderer } from 'three/webgpu';
import { type SunShadowFilterMode, VISUAL } from '../../config/visualTuning';
import { PcssShadowFilter } from './pcssShadowFilter';
import { WidePCFShadowFilter } from './widePcfShadowFilter';

type SunShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof WidePCFShadowFilter | typeof PCFSoftShadowFilter | typeof PcssShadowFilter;
};

/**
 * WebGPU TSL shadow filter selection.
 * Soft: smooth 9-tap gather (r184 look) — ignores softness uniforms.
 * Vogel + usePcss: color-depth PCSS (min/max/penumbraScale).
 * Vogel without PCSS: compare-only WidePCF (uSoftnessMax radius).
 */
export function configureSunShadowFilter(
  renderer: WebGPURenderer,
  sun: DirectionalLight,
  mode: SunShadowFilterMode,
): void {
  renderer.shadowMap.type = PCFShadowMap;
  const usePcss = VISUAL.shadows.lighting.usePcss && mode === 'vogel';
  (sun.shadow as SunShadowWithFilter).filterNode =
    mode === 'soft' ? PCFSoftShadowFilter : usePcss ? PcssShadowFilter : WidePCFShadowFilter;
}
