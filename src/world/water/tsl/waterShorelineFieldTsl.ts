// src/world/water/tsl/waterShorelineFieldTsl.ts — horizontal metres from the waterline
import { Fn, float, length, smoothstep, vec2 } from 'three/tsl';
import { terrainMapUv } from '../../../map/mapUvTsl';
import { waterWaveUniforms } from '../material/waterWaveUniforms';
import { waterTideOffsetTsl } from './waterTideTsl';

type TslNode = any;

/** Floor on |grad h| so a dead-flat shelf does not explode shoreDistanceM. */
export const SHORE_MIN_SLOPE = 0.02;

export interface ShorelineFieldInputs {
  sampleHeightNorm: (worldXZ: TslNode) => TslNode;
  uHeightScale: TslNode;
}

export function createShorelineFieldTsl(inputs: ShorelineFieldInputs) {
  const { sampleHeightNorm, uHeightScale } = inputs;
  const wave = waterWaveUniforms;

  const sampleWorldY = (worldXZ: TslNode) => sampleHeightNorm(worldXZ).mul(uHeightScale);

  /**
   * Raw |∇h| from a 4-tap central difference. Do not reuse macroNormalAtWorldXZ —
   * its flat-blend zeroes gentle beach slopes and would blow up the distance field.
   */
  const rawSlope = Fn(([worldXZ]: TslNode[]) => {
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

  /**
   * Detail-displacement multiplier: 0 at the waterline → 1 beyond coastFlattenM.
   * Uses mean water Y (no live tide) plus a tidal-sweep pad so crags do not pop
   * as the disc bobs — grass compute and CPU footing stay frame-stable.
   */
  const coastFlattenWeight = Fn(([worldXZ]: TslNode[]) => {
    const slope = clampedSlope(worldXZ);
    const distMean = wave.uWaterY.sub(sampleWorldY(worldXZ)).div(slope);
    const expand = wave.uWaveAmplitude.mul(wave.uTideEnabled).div(slope);
    return smoothstep(float(0), wave.uCoastFlattenM, distMean.abs().sub(expand));
  });

  return { rawSlope, clampedSlope, shoreDistanceM, coastFlattenWeight };
}

/** Height-texture convenience wrapper for the water material. */
export function createShorelineFieldFromHeightTex(
  uHeightTex: TslNode,
  uWorldSize: TslNode,
  uHeightScale: TslNode,
) {
  return createShorelineFieldTsl({
    sampleHeightNorm: (worldXZ) => uHeightTex.sample(terrainMapUv(uWorldSize, worldXZ)).r,
    uHeightScale,
  });
}
