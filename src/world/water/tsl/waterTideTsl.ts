// src/world/water/tsl/waterTideTsl.ts — tidal bob on the water disc (XZ-independent)
import { sin, time } from 'three/tsl';
import { macroSurfaceWorldXZ } from '../../terrain/tsl/biomeAtlasUv';
import type { WaterWaveUniforms } from '../material/waterWaveUniforms';

type TslNode = any;

/** World-space Y offset from sin(time * speed) * amplitude; 0 when tide disabled. */
export function waterTideOffsetTsl(wave: WaterWaveUniforms): TslNode {
  const offset = sin(time.mul(wave.uWaveSpeed)).mul(wave.uWaveAmplitude);
  return offset.mul(wave.uTideEnabled);
}

/**
 * Undisplaced vertex world XZ — canonical {@link macroSurfaceWorldXZ} (terrain vSurfaceWorldXZ basis).
 */
export function waterVertexWorldXZTsl(): TslNode {
  return macroSurfaceWorldXZ();
}

/** Local Z displacement for the water plane — tide only (maps to world Y after -π/2 X rot). */
export function waterSurfaceYOffsetTsl(wave: WaterWaveUniforms): TslNode {
  return waterTideOffsetTsl(wave);
}

/** Dynamic water surface height — base plane Y plus the tidal bob. */
export function waterCurrentHeightAtXzTsl(baseWaterY: TslNode, wave: WaterWaveUniforms): TslNode {
  return baseWaterY.add(waterSurfaceYOffsetTsl(wave));
}
