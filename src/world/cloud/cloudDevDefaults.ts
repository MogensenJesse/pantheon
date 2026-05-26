import type { CloudDevSettings } from '../../core/GameState';
import { cloneHorizonRingDefaults } from './cloudHorizonRing';

export const CLOUD_DEV_DEFAULTS: Omit<CloudDevSettings, 'dirty'> = {
  rings: cloneHorizonRingDefaults(),
  ringRotationDeg: 0,
  puffAlphaMin: 0.38,
  rotationJitter: 1,
};

export function resetCloudDev(settings: CloudDevSettings): void {
  settings.rings = cloneHorizonRingDefaults();
  settings.ringRotationDeg = CLOUD_DEV_DEFAULTS.ringRotationDeg;
  settings.puffAlphaMin = CLOUD_DEV_DEFAULTS.puffAlphaMin;
  settings.rotationJitter = CLOUD_DEV_DEFAULTS.rotationJitter;
  settings.dirty = true;
}
