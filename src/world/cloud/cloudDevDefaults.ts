import type { CloudDevSettings } from '../../core/GameState';
import { VISUAL } from '../../config/visualTuning';
import { cloneHorizonRingDefaults } from './cloudHorizonRing';

export const CLOUD_DEV_DEFAULTS: Omit<CloudDevSettings, 'dirty' | 'liveDirty'> = {
  rings: cloneHorizonRingDefaults(),
  ringRotationDeg: VISUAL.clouds.ringRotationDeg,
  rotationJitter: VISUAL.clouds.rotationJitter,
  nightAlphaMul: VISUAL.clouds.nightAlphaMul,
  alphaPower: VISUAL.clouds.alphaPower,
  colorDayThreshold: VISUAL.clouds.colorDayThreshold,
  nightTintDarkness: VISUAL.clouds.nightTintDarkness,
};

export function resetCloudDev(settings: CloudDevSettings): void {
  settings.rings = cloneHorizonRingDefaults();
  settings.ringRotationDeg = VISUAL.clouds.ringRotationDeg;
  settings.rotationJitter = VISUAL.clouds.rotationJitter;
  settings.nightAlphaMul = VISUAL.clouds.nightAlphaMul;
  settings.alphaPower = VISUAL.clouds.alphaPower;
  settings.colorDayThreshold = VISUAL.clouds.colorDayThreshold;
  settings.nightTintDarkness = VISUAL.clouds.nightTintDarkness;
  settings.dirty = true;
  settings.liveDirty = true;
}
