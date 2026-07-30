// src/rendering/sunShadow/configureSunShadowFilter.ts — hard main vs near PCSS filter setup
import { PCFShadowMap } from 'three';
import type { DirectionalLight, WebGPURenderer } from 'three/webgpu';
import { CoverageShadowFilter } from './coverageShadowFilter';
import { PcssShadowFilter } from './pcssShadowFilter';

type SunShadowWithFilter = DirectionalLight['shadow'] & {
  filterNode?: typeof CoverageShadowFilter | typeof PcssShadowFilter;
};

/** Hard ~1.5-texel PCF for the main/far sun map (godrays + cloud receive). */
export function configureHardSunShadowFilter(
  renderer: WebGPURenderer,
  light: DirectionalLight,
): void {
  renderer.shadowMap.type = PCFShadowMap;
  (light.shadow as SunShadowWithFilter).filterNode = CoverageShadowFilter;
}

/** Contact-hardening PCSS for the near cascade (ground receive). */
export function configurePcssSunShadowFilter(
  renderer: WebGPURenderer,
  light: DirectionalLight,
): void {
  renderer.shadowMap.type = PCFShadowMap;
  (light.shadow as SunShadowWithFilter).filterNode = PcssShadowFilter;
}
