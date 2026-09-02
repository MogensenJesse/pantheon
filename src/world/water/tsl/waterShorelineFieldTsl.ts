// src/world/water/tsl/waterShorelineFieldTsl.ts — horizontal metres from the waterline
import { Fn, float, length, vec2 } from 'three/tsl';
import { waterWaveUniforms } from '../material/waterWaveUniforms';
import { waterTideOffsetTsl } from './waterTideTsl';

type TslNode = any;

/** Floor on |grad h| so a dead-flat shelf does not explode shoreDistanceM. */
export const SHORE_MIN_SLOPE = 0.02;

export interface ShorelineFieldInputs {
  /** World-space terrain Y in metres — must match the visible mesh (chisel). */
  sampleWorldY: (worldXZ: TslNode) => TslNode;
  /**
   * Smooth |∇h| for converting depth → horizontal metres. Must be C0
   * (bilinear sculpt Y). Facet-face slope is piecewise-constant and
   * `fwidth` of shoreDistanceM then paints every 8 m crease as foam.
   * Omit to 4-tap `sampleWorldY` with `uShoreSlopeStepM`.
   */
  sampleSlope?: (worldXZ: TslNode) => TslNode;
}

export function createShorelineFieldTsl(inputs: ShorelineFieldInputs) {
  const { sampleWorldY, sampleSlope } = inputs;
  const wave = waterWaveUniforms;

  /**
   * Raw |∇h|. Default 4-tap is for callers that omit `sampleSlope`. Do not use
   * `macroNormalAtWorldXZ` — its flat-blend zeroes gentle beach slopes.
   */
  const rawSlope = sampleSlope
    ? Fn(([worldXZ]: TslNode[]) => sampleSlope(worldXZ))
    : Fn(([worldXZ]: TslNode[]) => {
        const step = wave.uShoreSlopeStepM;
        const two = step.mul(2);
        const yL = sampleWorldY(worldXZ.sub(vec2(step, 0)));
        const yR = sampleWorldY(worldXZ.add(vec2(step, 0)));
        const yD = sampleWorldY(worldXZ.sub(vec2(0, step)));
        const yU = sampleWorldY(worldXZ.add(vec2(0, step)));
        const dhdx = yR.sub(yL).div(two);
        const dhdz = yU.sub(yD).div(two);
        return length(vec2(dhdx, dhdz));
      });

  const clampedSlope = Fn(([worldXZ]: TslNode[]) =>
    rawSlope(worldXZ).clamp(float(SHORE_MIN_SLOPE), wave.uShoreMaxSlope),
  );

  const shoreDistanceFromWaterY = Fn(([worldXZ, waterY]: TslNode[]) => {
    const depth = waterY.sub(sampleWorldY(worldXZ));
    return depth.div(clampedSlope(worldXZ));
  });

  /** Horizontal metres from the visual waterline (includes tide). Positive seaward. */
  const shoreDistanceM = Fn(([worldXZ]: TslNode[]) =>
    shoreDistanceFromWaterY(worldXZ, wave.uWaterY.add(waterTideOffsetTsl(wave))),
  );

  return { rawSlope, clampedSlope, shoreDistanceM };
}
