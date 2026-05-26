import type { CloudDevSettings } from '../../core/GameState';
import { cloneHorizonRingDefaults } from './cloudHorizonRing';

export const CLOUD_DEV_DEFAULTS: Omit<CloudDevSettings, 'dirty' | 'liveDirty'> = {
  rings: cloneHorizonRingDefaults(),
  ringRotationDeg: 0,
  rotationJitter: 1,
  nightAlphaMul: 0.2,
  alphaPower: 2.2,
  colorDayThreshold: 0.35,
  nightTintDarkness: 0.85,
};

export function resetCloudDev(settings: CloudDevSettings): void {
  settings.rings = cloneHorizonRingDefaults();
  settings.ringRotationDeg = CLOUD_DEV_DEFAULTS.ringRotationDeg;
  settings.rotationJitter = CLOUD_DEV_DEFAULTS.rotationJitter;
  settings.nightAlphaMul = CLOUD_DEV_DEFAULTS.nightAlphaMul;
  settings.alphaPower = CLOUD_DEV_DEFAULTS.alphaPower;
  settings.colorDayThreshold = CLOUD_DEV_DEFAULTS.colorDayThreshold;
  settings.nightTintDarkness = CLOUD_DEV_DEFAULTS.nightTintDarkness;
  settings.dirty = true;
  settings.liveDirty = true;
}
