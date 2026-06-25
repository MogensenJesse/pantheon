// src/rendering/sunShadow/configureSunShadowFilter.ts — WebGPU shadow filter setup
import { PCFShadowMap } from 'three';
import type { DirectionalLight, WebGPURenderer } from 'three/webgpu';
import { PCFShadowFilter } from 'three/src/nodes/lighting/ShadowFilterNode.js';

type SunShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof PCFShadowFilter;
};

/**
 * WebGPU TSL: PCFSoftShadowMap uses a fixed 3×3 kernel and ignores shadow.radius.
 * Force Vogel-disk PCF so softness + dev sliders actually widen the filter.
 */
export function configureSunShadowFilter(
  renderer: WebGPURenderer,
  sun: DirectionalLight,
): void {
  renderer.shadowMap.type = PCFShadowMap;
  (sun.shadow as SunShadowWithFilter).filterNode = PCFShadowFilter;
}
