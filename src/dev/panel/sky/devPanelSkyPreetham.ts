// src/dev/panel/sky/devPanelSkyPreetham.ts — sun azimuth (Preetham stops → Time of day)
import { VISUAL } from '../../../config/visualTuning';
import { setDayCycleDevScrubLock } from '../../../core/reveal/DayCycle';
import { sunRevealState } from '../../../core/reveal/sunRevealState';
import type { PostFXContext } from '../../../rendering/PostFX';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import { resetSunDevState } from '../../../rendering/sunDevState';
import { currentSunAzimuthDeg } from '../../../rendering/sunSpherical';
import { bindRange, type RangeSpec, rangeRowHtml, syncSpecs } from '../../bindRange';
import { pushDevSkyOverride } from './devPanelSkyShared';

export const AZIMUTH_SPEC: RangeSpec = {
  id: 'dev-sun-azimuth',
  label: 'Azimuth (scrub)',
  min: -180,
  max: 180,
  step: 0.1,
  defaultValue: VISUAL.sky.cycle.azimuthEast,
  format: (v) => v.toFixed(1),
};

export const PREETHAM_SYNC_SPECS: RangeSpec[] = [AZIMUTH_SPEC];

export function preethamSkyBodyHtml(): string {
  return `
      <p class="dev-hint">Preetham stop look lives under <strong>Time of day</strong>.</p>
      ${rangeRowHtml(AZIMUTH_SPEC)}
      <label class="dev-row dev-row-check">
        <span>Show sun disc</span>
        <input type="checkbox" id="dev-sky-show-sun-disc" checked />
      </label>`;
}

export function syncPreethamPanel(panel: HTMLDivElement): void {
  syncSpecs(panel, [AZIMUTH_SPEC], () => currentSunAzimuthDeg());
}

export function bindPreethamSkyPanel(
  panel: HTMLDivElement,
  sky: SkySystemContext,
  postFX: PostFXContext,
): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(
    bindRange(panel, AZIMUTH_SPEC.id, `${AZIMUTH_SPEC.id}-out`, AZIMUTH_SPEC.format, (v) => {
      setDayCycleDevScrubLock(true);
      sunRevealState.azimuthDeg = v;
    }),
  );

  const showDisc = panel.querySelector('#dev-sky-show-sun-disc') as HTMLInputElement;
  showDisc.checked = VISUAL.sky.static.showSunDisc > 0;
  const onDiscChange = () => {
    pushDevSkyOverride(sky, postFX, 'showSunDisc', showDisc.checked ? 1 : 0);
  };
  showDisc.addEventListener('change', onDiscChange);

  return () => {
    for (const fn of disposers) fn();
    showDisc.removeEventListener('change', onDiscChange);
  };
}

export function resetPreethamSunDev(): void {
  resetSunDevState();
  sunRevealState.azimuthDeg = VISUAL.sky.cycle.azimuthEast;
}
