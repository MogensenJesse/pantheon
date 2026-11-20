// src/world/water/tsl/waterShorelineFieldTsl.ts — horizontal metres from the waterline
import { Fn, float } from 'three/tsl';
import { waterWaveUniforms } from '../material/waterWaveUniforms';

type TslNode = any;

/** Floor on |grad h| so a dead-flat shelf does not explode the distance. */
export const SHORE_MIN_SLOPE = 0.02;

export interface ShorelineFieldInputs {
  /** World-space terrain Y in metres — must match the visible mesh (chisel). */
  sampleWorldY: (worldXZ: TslNode) => TslNode;
  /**
   * Smooth |∇h| for converting depth → horizontal metres. Must be C0 (bilinear sculpt Y): facet-face slope is
   * piecewise-constant and `fwidth` of the distance then paints every 8 m crease as foam. Do not use
   * `macroNormalAtWorldXZ` — its flat-blend zeroes gentle beach slopes.
   */
  sampleSlope: (worldXZ: TslNode) => TslNode;
}

export function createShorelineFieldTsl({ sampleWorldY, sampleSlope }: ShorelineFieldInputs) {
  const wave = waterWaveUniforms;

  /** Horizontal metres from the waterline, positive seaward, against the real surface: the mean level plus `surfaceOffset` (the swell's height there). */
  const shoreDistanceAtM = Fn(([worldXZ, surfaceOffset]: TslNode[]) => {
    const depth = wave.uWaterY.add(surfaceOffset).sub(sampleWorldY(worldXZ));
    return depth.div(sampleSlope(worldXZ).clamp(float(SHORE_MIN_SLOPE), wave.uShoreMaxSlope));
  });

  return { shoreDistanceAtM };
}
