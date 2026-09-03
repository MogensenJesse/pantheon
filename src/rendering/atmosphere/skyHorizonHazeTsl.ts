// src/rendering/atmosphere/skyHorizonHazeTsl.ts — horizon mix toward fog tint (SkyMesh + night HDRI)
import { abs, float, positionWorldDirection, smoothstep } from 'three/tsl';

type TslNode = any;

/**
 * Mix RGB toward fog tint.
 * Day: |viewDir.y| horizon band × aerial strength (far-clip dome must stay `fog = false`).
 * Night: analytical valley-slab volume (path through fogBase..fogTop) — fills the air
 * when the view ray crosses the night valley layer, including looking at the sky.
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
  // TSL method mix is mixElement(t, a, b) → mix(a, b, t). Same as water/clouds.
  return (weight as TslNode).mix(rgb, fogColor);
}
