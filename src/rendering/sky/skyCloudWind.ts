// src/rendering/sky/skyCloudWind.ts — SkyMesh travel from the deck wind
import type { Vector2 } from 'three';
import { headingToXZ } from '../../core/math/geom';
import { getLiveCloudSettings } from '../clouds/cloudDevState';
import { WIND_TRAVEL_SCALE } from '../clouds/cloudWindInstances';
import { readCumulusDeck } from '../clouds/cumulusDeck';

const _heading = { x: 0, z: 0 };

/** mix(1, 0.1, elevation) — the SkyMesh cloud-plane factor. */
function skyCloudElevationFactor(cloudElevation: number): number {
  return 1 - 0.9 * cloudElevation;
}

/**
 * UV offset at `elapsed`. Opposite the deck heading: adding it to cloud UV
 * moves the sample, so the pattern travels with the deck on the same clock.
 */
export function writeSkyCloudWind(
  windDirectionDeg: number,
  windSpeed: number,
  cloudScale: number,
  cloudElevation: number,
  deckHeightM: number,
  elapsed: number,
  out: Vector2,
): void {
  const metersPerSec = windSpeed * WIND_TRAVEL_SCALE;
  const elevation = Math.max(skyCloudElevationFactor(cloudElevation), 1e-3);
  const height = Math.max(deckHeightM, 1);
  const speed = (metersPerSec * cloudScale) / (height * elevation);
  const { x, z } = headingToXZ(windDirectionDeg, _heading);
  const travel = speed * elapsed;
  out.set(-x * travel, -z * travel);
}

export function syncSkyMeshCloudWind(
  skyMesh: {
    cloudWind: { value: Vector2 };
    cloudScale: { value: number };
    cloudElevation: { value: number };
  },
  elapsed: number,
): void {
  const deck = readCumulusDeck();
  const settings = getLiveCloudSettings();
  const height = (deck.deckMinY + deck.deckMaxY) * 0.5;
  writeSkyCloudWind(
    settings.windDirectionDeg,
    deck.windSpeed,
    skyMesh.cloudScale.value,
    skyMesh.cloudElevation.value,
    height,
    elapsed,
    skyMesh.cloudWind.value,
  );
}
