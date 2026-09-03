// src/rendering/atmosphere/skyHorizonHazeTsl.ts — horizon mix toward fog tint (SkyMesh + night HDRI)
import { abs, float, positionWorldDirection, smoothstep } from 'three/tsl';
import { mixTowardFog } from './mixTowardFogTsl';

type TslNode = any;

/**
 * Mix RGB toward fog tint (callers must pass already-exposed/intensity-scaled RGB).
 * Day: |viewDir.y| horizon band × aerial strength (far-clip dome must stay `fog = false`).
 * Aerial live strength eases toward `aerialNightMul` of day strength at night.
 * Night volume: analytical valley-slab — path through fogBase..fogTop from a ridge;
 * under the ceiling (including below fogBase) a surround veil fills sky and distant air.
 */
export function applySkyHorizonHaze(
  rgb: TslNode,
  fogColor: TslNode,
  aerialStrength: TslNode,
  nightVolume: TslNode,
  horizonStart: TslNode,
  horizonEnd: TslNode,
): TslNode {
  const elev = abs(positionWorldDirection.y);
  const band = float(1).sub(smoothstep(horizonStart, horizonEnd, elev));
  const daySeam = band.mul(aerialStrength);
  const weight = daySeam.oneMinus().mul(nightVolume.oneMinus()).oneMinus().saturate();
  return mixTowardFog(rgb, fogColor, weight);
}
