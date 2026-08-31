// src/rendering/atmosphere/skyHorizonHazeTsl.ts — horizon mix toward fog tint (SkyMesh + night HDRI)
import { abs, float, positionWorldDirection, smoothstep } from 'three/tsl';

type TslNode = any;

/**
 * Mix RGB toward fog tint near the horizon. Uses |viewDir.y| (0 = horizon).
 * Weight is 0 at `horizonEnd` and `aerialStrength` at `horizonStart`.
 * Scene fog on the sky box would wash the whole dome — this band is the seam.
 */
export function applySkyHorizonHaze(
  rgb: TslNode,
  fogColor: TslNode,
  aerialStrength: TslNode,
  horizonStart: TslNode,
  horizonEnd: TslNode,
): TslNode {
  const elev = abs(positionWorldDirection.y);
  const band = float(1).sub(smoothstep(horizonStart, horizonEnd, elev));
  const weight = band.mul(aerialStrength).saturate();
  // TSL method mix is mixElement(t, a, b) → mix(a, b, t). Same as water/clouds.
  return (weight as TslNode).mix(rgb, fogColor);
}
