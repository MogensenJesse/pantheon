// src/rendering/postfx/sunHorizonOcclusion.ts — terrain silhouette elevation angle toward the sun
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';

export interface SunHorizonOcclusionConfig {
  maxDistanceM: number;
  sampleCount: number;
  rayFanCount: number;
  rayFanSpreadDeg: number;
  smoothRatePerSec: number;
}

export function defaultSunHorizonOcclusionConfig(): SunHorizonOcclusionConfig {
  return { ...VISUAL.godrays.horizonOcclusion };
}

/**
 * Terrain silhouette elevation angle (deg) toward the sun azimuth, as seen from
 * (originX, originY, originZ). Marches a small fan of rays centered on the sun
 * azimuth out to `maxDistanceM`, sampling `getWorldY` and tracking the steepest
 * angle-above-eye-level found — i.e. the angle the sun must clear to be visible.
 */
export function computeSunHorizonElevationDeg(
  originX: number,
  originZ: number,
  originY: number,
  sunAzimuthDeg: number,
  getWorldY: (x: number, z: number) => number,
  config: SunHorizonOcclusionConfig,
): number {
  const { maxDistanceM, sampleCount, rayFanCount, rayFanSpreadDeg } = config;
  const steps = Math.max(1, sampleCount);
  const fanCount = Math.max(1, rayFanCount);
  const stepM = maxDistanceM / steps;

  let maxAngleDeg = -90;
  for (let f = 0; f < fanCount; f++) {
    const fanT = fanCount === 1 ? 0 : f / (fanCount - 1) - 0.5;
    const azimuthDeg = sunAzimuthDeg + fanT * rayFanSpreadDeg;
    const azimuthRad = MathUtils.degToRad(azimuthDeg);
    const dirX = Math.sin(azimuthRad);
    const dirZ = Math.cos(azimuthRad);

    for (let s = 1; s <= steps; s++) {
      const distanceM = stepM * s;
      const x = originX + dirX * distanceM;
      const z = originZ + dirZ * distanceM;
      const worldY = getWorldY(x, z);
      const angleDeg = MathUtils.radToDeg(Math.atan2(worldY - originY, distanceM));
      if (angleDeg > maxAngleDeg) maxAngleDeg = angleDeg;
    }
  }

  return maxAngleDeg;
}

export interface SunHorizonTracker {
  update: (
    originX: number,
    originZ: number,
    originY: number,
    sunAzimuthDeg: number,
    getWorldY: (x: number, z: number) => number,
    dt: number,
  ) => number;
  getConfig: () => SunHorizonOcclusionConfig;
  setConfig: (partial: Partial<SunHorizonOcclusionConfig>) => void;
  reset: () => void;
}

/** Stateful per-frame horizon tracker with time-based EMA smoothing (avoids sample jitter/pop). */
export function createSunHorizonTracker(
  initialConfig: SunHorizonOcclusionConfig = defaultSunHorizonOcclusionConfig(),
): SunHorizonTracker {
  let config = { ...initialConfig };
  let smoothedDeg: number | null = null;
  let lastOriginX = Number.NaN;
  let lastOriginZ = Number.NaN;
  let lastOriginY = Number.NaN;
  let lastAzimuthDeg = Number.NaN;

  const ORIGIN_XZ_THRESH_SQ = 0.25;
  const ORIGIN_Y_THRESH = 0.25;
  const AZIMUTH_THRESH_DEG = 0.25;

  return {
    update: (originX, originZ, originY, sunAzimuthDeg, getWorldY, dt) => {
      const originMoved =
        Number.isNaN(lastOriginX) ||
        (originX - lastOriginX) ** 2 + (originZ - lastOriginZ) ** 2 > ORIGIN_XZ_THRESH_SQ ||
        Math.abs(originY - lastOriginY) > ORIGIN_Y_THRESH;
      const azimuthMoved =
        Number.isNaN(lastAzimuthDeg) ||
        Math.abs(sunAzimuthDeg - lastAzimuthDeg) > AZIMUTH_THRESH_DEG;

      if (!originMoved && !azimuthMoved && smoothedDeg !== null) {
        return smoothedDeg;
      }

      const target = computeSunHorizonElevationDeg(
        originX,
        originZ,
        originY,
        sunAzimuthDeg,
        getWorldY,
        config,
      );
      lastOriginX = originX;
      lastOriginZ = originZ;
      lastOriginY = originY;
      lastAzimuthDeg = sunAzimuthDeg;

      if (smoothedDeg === null) {
        smoothedDeg = target;
      } else {
        const alpha = 1 - Math.exp(-config.smoothRatePerSec * Math.max(0, dt));
        smoothedDeg = MathUtils.lerp(smoothedDeg, target, alpha);
      }
      return smoothedDeg;
    },
    getConfig: () => config,
    setConfig: (partial) => {
      config = { ...config, ...partial };
    },
    reset: () => {
      smoothedDeg = null;
      lastOriginX = Number.NaN;
      lastOriginZ = Number.NaN;
      lastOriginY = Number.NaN;
      lastAzimuthDeg = Number.NaN;
    },
  };
}
