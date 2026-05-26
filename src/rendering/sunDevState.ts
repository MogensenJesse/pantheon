// src/rendering/sunDevState.ts — DEV tuning for sun disc + directional light placement

/** Default matches legacy updateSunShadowTarget offset (−40, −30) → dist 50. */
const DEFAULT_AZIMUTH_DEG = (Math.atan2(-40, -30) * 180) / Math.PI;
const DEFAULT_HORIZONTAL_DIST = 50;

export const sunDevState = {
  /** Visual-only: rotate sky sun disc around world Y (degrees). */
  skyAzimuthOffsetDeg: 0,
  /** Visual-only: tilt sky sun disc up/down (degrees). */
  skyElevationOffsetDeg: 0,
  /** Scales SkyMesh mieCoefficient (smaller = tighter / less bloomy sun). */
  skySizeMul: 1,
  /** Light + shadows: azimuth around player target (degrees). */
  lightAzimuthDeg: DEFAULT_AZIMUTH_DEG,
  /** Light + shadows: horizontal distance from player target. */
  lightHorizontalDist: DEFAULT_HORIZONTAL_DIST,
  /** Added to WorldReveal yOffset for light elevation. */
  lightElevationExtra: 0,
};

export function resetSunDevState(): void {
  sunDevState.skyAzimuthOffsetDeg = 0;
  sunDevState.skyElevationOffsetDeg = 0;
  sunDevState.skySizeMul = 1;
  sunDevState.lightAzimuthDeg = DEFAULT_AZIMUTH_DEG;
  sunDevState.lightHorizontalDist = DEFAULT_HORIZONTAL_DIST;
  sunDevState.lightElevationExtra = 0;
}
