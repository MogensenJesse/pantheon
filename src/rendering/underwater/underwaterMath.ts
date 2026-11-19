// src/rendering/underwater/underwaterMath.ts — plain-number mirror of the fog path maths in underwaterTsl.ts (checked by scripts/checks/underwater)

/**
 * Metres of the straight segment (from, to) that lie below the plane y = surfaceY.
 * Both ends under: the whole length. Both above: 0. One each side: the part under.
 * Same formula as `underwaterPathM` in underwaterTsl.ts.
 */
export function underwaterPathM(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  surfaceY: number,
): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const yc = from.y - surfaceY;
  const yp = to.y - surfaceY;
  const below = Math.max(-yc, 0) + Math.max(-yp, 0);
  const span = Math.max(Math.abs(yc - yp), 1e-4);
  return dist * Math.min(Math.max(below / span, 0), 1);
}

export const WATER_INDEX = 1.33;
/** cos of Snell's critical angle (48.6 degrees): rays steeper than this leave the water, flatter ones are mirrored. */
export const CRITICAL_COS = Math.sqrt(1 - 1 / (WATER_INDEX * WATER_INDEX));

/**
 * Elevation (degrees above the horizon) at which the sun shows when seen from under a flat surface. Its light bends
 * towards the vertical, so a low sun looks higher (horizon sun: about 41 degrees up with a real Snell window).
 * `windowEdgeCos` is the window's cone (`window.edgeCos`): the surface shader stretches the real Snell cone onto it
 * (see `underwaterCeilingColorTsl`), which pushes the sun further from the vertical; this follows the same mapping so
 * the shafts meet the sun's glint. The default is the real window (no stretch). Negative elevations stay below.
 */
export function apparentSunElevationDeg(
  elevationDeg: number,
  windowEdgeCos = CRITICAL_COS,
): number {
  if (elevationDeg <= 0) return elevationDeg;
  const zenith = ((90 - elevationDeg) * Math.PI) / 180;
  const cosWater = Math.cos(Math.asin(Math.min(Math.sin(zenith) / WATER_INDEX, 1)));
  const cosEff = Math.min(Math.max((cosWater - CRITICAL_COS) / (1 - CRITICAL_COS), 0), 1);
  const cosView = windowEdgeCos + cosEff * (1 - windowEdgeCos);
  return 90 - (Math.acos(cosView) * 180) / Math.PI;
}

/** 1 - exp(-path * density): the share of a surface's colour the water has replaced with fog. */
export function underwaterFogFactor(pathM: number, density: number): number {
  return 1 - Math.exp(-pathM * density);
}
