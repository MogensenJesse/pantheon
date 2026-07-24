// src/world/water/tsl/waterTideTsl.ts — tidal bob + shared XZ ripple (water mesh + shore foam)
import { sin, time } from 'three/tsl';
import { macroSurfaceWorldXZ } from '../../terrain/tsl/biomeAtlasUv';
import type { WaterWaveUniforms } from '../material/waterWaveUniforms';

type TslNode = any;

/** World-space Y offset from sin(time * speed) * amplitude; 0 when tide disabled. */
export function waterTideOffsetTsl(wave: WaterWaveUniforms): TslNode {
  const offset = sin(time.mul(wave.uWaveSpeed)).mul(wave.uWaveAmplitude);
  return offset.mul(wave.uTideEnabled);
}

/** Multi-frequency sine chop on world XZ — shared by water vertices and shore foam stripe. */
export function waterFoamRippleOffsetTsl(worldXZ: TslNode, wave: WaterWaveUniforms): TslNode {
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
 * Undisplaced vertex world XZ — canonical {@link macroSurfaceWorldXZ} (terrain vSurfaceWorldXZ basis).
 * Sample ripple here (not post-displacement fragment XZ) so foam and water vertices agree.
 */
export function waterVertexWorldXZTsl(): TslNode {
  return macroSurfaceWorldXZ();
}

/** Local Z displacement for the water plane — tide + per-vertex ripple (maps to world Y after -π/2 X rot). */
export function waterSurfaceYOffsetTsl(worldXZ: TslNode, wave: WaterWaveUniforms): TslNode {
  return waterTideOffsetTsl(wave).add(waterFoamRippleOffsetTsl(worldXZ, wave));
}

/** Dynamic water surface height at world XZ — base plane Y plus tide and ripple. */
export function waterCurrentHeightAtXzTsl(
  baseWaterY: TslNode,
  wave: WaterWaveUniforms,
  worldXZ: TslNode,
): TslNode {
  return baseWaterY.add(waterSurfaceYOffsetTsl(worldXZ, wave));
}

/** Foam stripe inner edge — same as surface height plus optional downward bias for overlap. */
export function waterFoamWaterlineHeightAtXzTsl(
  baseWaterY: TslNode,
  wave: WaterWaveUniforms,
  worldXZ: TslNode,
): TslNode {
  return waterCurrentHeightAtXzTsl(baseWaterY, wave, worldXZ).add(wave.uFoamWaterlineBias);
}
