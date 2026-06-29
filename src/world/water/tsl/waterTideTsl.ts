// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/water/tsl/waterTideTsl.ts — tidal bob + shared XZ ripple (water mesh + shore foam)
import { float, modelWorldMatrix, positionGeometry, sin, time, vec2, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { WaterWaveUniforms } from '../waterWaveUniforms';

/** World-space Y offset from sin(time * speed) * amplitude; 0 when tide disabled. */
export function waterTideOffsetTsl(wave: WaterWaveUniforms): Node {
  const offset = sin(time.mul(wave.uWaveSpeed)).mul(wave.uWaveAmplitude);
  return offset.mul(wave.uTideEnabled);
}

/** Multi-frequency sine chop on world XZ — shared by water vertices and shore foam stripe. */
export function waterFoamRippleOffsetTsl(worldXZ: Node, wave: WaterWaveUniforms): Node {
  const t = time.mul(wave.uFoamRippleSpeed);
  const scale = wave.uFoamRippleScale;
  const chopA = sin(worldXZ.x.mul(scale).add(t.mul(1.1)))
    .mul(sin(worldXZ.y.mul(scale.mul(0.87)).add(t.mul(0.85))))
    .mul(0.55);
  const chopB = sin(worldXZ.x.mul(scale.mul(1.65)).sub(t.mul(1.35))).mul(0.28);
  const chopC = sin(worldXZ.y.mul(scale.mul(2.05)).add(t.mul(1.55))).mul(0.22);
  return chopA.add(chopB).add(chopC).mul(wave.uFoamRippleAmplitude).mul(wave.uTideEnabled);
}

/**
 * Undisplaced vertex world XZ — same basis as terrain `macroSurfaceWorldXZ` / `vSurfaceWorldXZ`.
 * Sample ripple here (not post-displacement fragment XZ) so foam and water vertices agree.
 */
export function waterVertexWorldXZTsl(): Node {
  const worldPos = modelWorldMatrix.mul(vec4(positionGeometry, float(1))).xyz;
  return vec2(worldPos.x, worldPos.z);
}

/** Local Z displacement for the water plane — tide + per-vertex ripple (maps to world Y after -π/2 X rot). */
export function waterSurfaceYOffsetTsl(worldXZ: Node, wave: WaterWaveUniforms): Node {
  return waterTideOffsetTsl(wave).add(waterFoamRippleOffsetTsl(worldXZ, wave));
}

/** Dynamic water surface height at world XZ — base plane Y plus tide and ripple. */
export function waterCurrentHeightAtXzTsl(
  baseWaterY: Node,
  wave: WaterWaveUniforms,
  worldXZ: Node,
): Node {
  return baseWaterY.add(waterSurfaceYOffsetTsl(worldXZ, wave));
}

/** Foam stripe inner edge — same as surface height plus optional downward bias for overlap. */
export function waterFoamWaterlineHeightAtXzTsl(
  baseWaterY: Node,
  wave: WaterWaveUniforms,
  worldXZ: Node,
): Node {
  return waterCurrentHeightAtXzTsl(baseWaterY, wave, worldXZ).add(wave.uFoamWaterlineBias);
}

/** Uniform tide only (no spatial ripple) — legacy helper. */
export function waterCurrentHeightTsl(baseWaterY: Node, wave: WaterWaveUniforms): Node {
  return baseWaterY.add(waterTideOffsetTsl(wave));
}
