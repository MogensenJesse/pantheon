// src/rendering/sunShadow/configureSunShadowFilter.ts — WebGPU shadow filter setup
import { PCFShadowMap } from 'three';
import { PCFSoftShadowFilter } from 'three/tsl';
import type { DirectionalLight, WebGPURenderer } from 'three/webgpu';
import { type SunShadowFilterMode, VISUAL } from '../../config/visualTuning';
import { CoverageShadowFilter } from './coverageShadowFilter';
import { PcssShadowFilter } from './pcssShadowFilter';
import { WidePCFShadowFilter } from './widePcfShadowFilter';

type SunShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?:
    | typeof WidePCFShadowFilter
    | typeof PCFSoftShadowFilter
    | typeof PcssShadowFilter
    | typeof CoverageShadowFilter;
};

/**
 * WebGPU TSL shadow filter selection.
 * Soft: smooth 9-tap gather (r184 look) — ignores softness uniforms.
 * Vogel + usePcss: color-depth PCSS (min/max/penumbraScale).
 * Vogel without PCSS: compare-only WidePCF (uSoftnessMax radius).
 * Coverage: hard ~1.5-texel PCF for the far map when near cascade owns soft detail.
 */
export function configureSunShadowFilter(
  renderer: WebGPURenderer,
  sun: DirectionalLight,
  mode: SunShadowFilterMode,
): void {
  renderer.shadowMap.type = PCFShadowMap;
  if (mode === 'soft') {
    (sun.shadow as SunShadowWithFilter).filterNode = PCFSoftShadowFilter;
    return;
  }
  if (mode === 'coverage') {
    (sun.shadow as SunShadowWithFilter).filterNode = CoverageShadowFilter;
    return;
  }
  const usePcss = VISUAL.shadows.lighting.usePcss;
  (sun.shadow as SunShadowWithFilter).filterNode = usePcss
    ? PcssShadowFilter
    : WidePCFShadowFilter;
}
