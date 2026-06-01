// src/ui/dev/sky/devPanelNightHdri.ts — night EXR tuning (DEV)
import { VISUAL } from '../../../config/visualTuning';
import { nightHdriWeightForGameState } from '../../../rendering/sky/hdri/nightHdriBlend';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import { SUN_REVEAL } from '../../../rendering/sky/skyDefaults';
import { bindRange, injectRangeRows, type RangeSpec, syncSpecs } from '../bindRange';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const NIGHT_HDRI = VISUAL.sky.nightHdri;

const HDRI_INTENSITY_SPEC: RangeSpec = {
  id: 'dev-hdri-intensity',
  label: 'HDRI intensity',
  min: 0,
  max: 3,
  step: 0.01,
  defaultValue: NIGHT_HDRI.intensity,
  format: (v) => v.toFixed(2),
};

const HDRI_ROTATION_SPEC: RangeSpec = {
  id: 'dev-hdri-rotation',
  label: 'HDRI rotation Y (°)',
  min: -180,
  max: 180,
  step: 1,
  defaultValue: NIGHT_HDRI.rotationY * RAD2DEG,
  format: (v) => String(Math.round(v)),
};

const HDRI_FADE_START_SPEC: RangeSpec = {
  id: 'dev-hdri-fade-start',
  label: 'HDRI full at/below (°)',
  min: -30,
  max: 30,
  step: 0.5,
  defaultValue: NIGHT_HDRI.fadeElevationStart,
  format: (v) => v.toFixed(1),
};

const HDRI_FADE_END_SPEC: RangeSpec = {
  id: 'dev-hdri-fade-end',
  label: 'HDRI off at/above (°)',
  min: SUN_REVEAL.elevationNight + 0.5,
  max: SUN_REVEAL.elevationDay + 15,
  step: 0.5,
  defaultValue: NIGHT_HDRI.fadeElevationEnd,
  format: (v) => v.toFixed(1),
};

export const HDRI_SPECS = [
  HDRI_INTENSITY_SPEC,
  HDRI_ROTATION_SPEC,
  HDRI_FADE_START_SPEC,
  HDRI_FADE_END_SPEC,
];

export function nightHdriSubsectionHtml(): string {
  return `
      <details class="dev-subsection" id="dev-sky-hdri-subsection">
        <summary>Night HDRI</summary>
        <div class="dev-section-body" id="dev-sky-hdri-rows"></div>
        <p class="dev-hint">HDRI fade uses sun elevation (reveal ${SUN_REVEAL.elevationNight}° → ${SUN_REVEAL.elevationDay}°). &quot;Off at/above&quot; above day keeps EXR partially visible at cap. Log night HDRI in Debug.</p>
      </details>`;
}

export function setupNightHdriSubsection(panel: HTMLDivElement, sky: SkySystemContext): void {
  const hdriSubsection = panel.querySelector(
    '#dev-sky-hdri-subsection',
  ) as HTMLDetailsElement | null;
  const hdriHost = panel.querySelector('#dev-sky-hdri-rows');
  if (sky.hasNightHdri && hdriHost) {
    injectRangeRows(hdriHost, HDRI_SPECS);
  } else if (hdriSubsection) {
    hdriSubsection.hidden = true;
  }
}

export function syncNightHdriPanel(panel: HTMLDivElement, sky: SkySystemContext): void {
  if (!sky.hasNightHdri) return;
  const h = sky.getNightHdriTuning();
  syncSpecs(panel, HDRI_SPECS, (s) => {
    if (s.id === HDRI_INTENSITY_SPEC.id) return h.intensity;
    if (s.id === HDRI_ROTATION_SPEC.id) return h.rotationY * RAD2DEG;
    if (s.id === HDRI_FADE_START_SPEC.id) return h.fadeElevationStart;
    if (s.id === HDRI_FADE_END_SPEC.id) return h.fadeElevationEnd;
    return 0;
  });
}

export function bindNightHdriPanel(panel: HTMLDivElement, sky: SkySystemContext): () => void {
  if (!sky.hasNightHdri) return () => {};

  const disposers: Array<() => void> = [];

  disposers.push(
    bindRange(
      panel,
      HDRI_INTENSITY_SPEC.id,
      `${HDRI_INTENSITY_SPEC.id}-out`,
      HDRI_INTENSITY_SPEC.format,
      (v) => {
        sky.setNightHdriTuning({ intensity: v });
        sky.setNightHdriWeight(nightHdriWeightForGameState());
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      HDRI_ROTATION_SPEC.id,
      `${HDRI_ROTATION_SPEC.id}-out`,
      HDRI_ROTATION_SPEC.format,
      (v) => {
        sky.setNightHdriTuning({ rotationY: v * DEG2RAD });
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      HDRI_FADE_START_SPEC.id,
      `${HDRI_FADE_START_SPEC.id}-out`,
      HDRI_FADE_START_SPEC.format,
      (v) => {
        sky.setNightHdriTuning({ fadeElevationStart: v });
        sky.setNightHdriWeight(nightHdriWeightForGameState());
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      HDRI_FADE_END_SPEC.id,
      `${HDRI_FADE_END_SPEC.id}-out`,
      HDRI_FADE_END_SPEC.format,
      (v) => {
        sky.setNightHdriTuning({ fadeElevationEnd: v });
        sky.setNightHdriWeight(nightHdriWeightForGameState());
      },
    ),
  );

  return () => {
    for (const fn of disposers) fn();
  };
}

export function resetNightHdriPanel(sky: SkySystemContext): void {
  if (!sky.hasNightHdri) return;
  sky.resetNightHdriTuning();
  sky.setNightHdriWeight(nightHdriWeightForGameState());
}
