// src/ui/dev/sky/devPanelNightHdri.ts — night EXR tuning (DEV)
import { VISUAL } from '../../../config/visualTuning';
import { nightHdriWeightForGameState } from '../../../rendering/sky/hdri/nightHdriBlend';
import type { NightHdriTuning } from '../../../rendering/sky/hdri/nightHdriRuntime';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import { NIGHT_BASELINE_ELEVATION_DEG } from '../../../rendering/sky/skyDefaults';
import { bindRange, injectRangeRows, type RangeSpec, syncSpecs } from '../bindRange';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const NIGHT_HDRI = VISUAL.sky.nightHdri;

export interface HdriSpec extends RangeSpec {
  read: (tuning: Readonly<NightHdriTuning>) => number;
}

const HDRI_INTENSITY_SPEC: HdriSpec = {
  id: 'dev-hdri-intensity',
  label: 'HDRI intensity',
  min: 0,
  max: 3,
  step: 0.01,
  defaultValue: NIGHT_HDRI.intensity,
  format: (v) => v.toFixed(2),
  read: (h) => h.intensity,
};

const HDRI_ROTATION_SPEC: HdriSpec = {
  id: 'dev-hdri-rotation',
  label: 'HDRI rotation Y (°)',
  min: -180,
  max: 180,
  step: 1,
  defaultValue: NIGHT_HDRI.rotationY * RAD2DEG,
  format: (v) => String(Math.round(v)),
  read: (h) => h.rotationY * RAD2DEG,
};

const HDRI_FADE_START_SPEC: HdriSpec = {
  id: 'dev-hdri-fade-start',
  label: 'HDRI full at/below (°)',
  min: -30,
  max: 30,
  step: 0.5,
  defaultValue: NIGHT_HDRI.fadeElevationStart,
  format: (v) => v.toFixed(1),
  read: (h) => h.fadeElevationStart,
};

const HDRI_FADE_END_SPEC: HdriSpec = {
  id: 'dev-hdri-fade-end',
  label: 'HDRI off at/above (°)',
  min: NIGHT_BASELINE_ELEVATION_DEG + 0.5,
  max: VISUAL.sky.cycle.peakElevationDeg + 15,
  step: 0.5,
  defaultValue: NIGHT_HDRI.fadeElevationEnd,
  format: (v) => v.toFixed(1),
  read: (h) => h.fadeElevationEnd,
};

const HDRI_HORIZON_DIM_START_SPEC: HdriSpec = {
  id: 'dev-hdri-horizon-dim-start',
  label: 'Horizon dim start',
  min: 0,
  max: 0.25,
  step: 0.005,
  defaultValue: NIGHT_HDRI.horizonDim.start,
  format: (v) => v.toFixed(3),
  read: (h) => h.horizonDimStart,
};

const HDRI_HORIZON_DIM_END_SPEC: HdriSpec = {
  id: 'dev-hdri-horizon-dim-end',
  label: 'Horizon dim end',
  min: 0.02,
  max: 0.45,
  step: 0.005,
  defaultValue: NIGHT_HDRI.horizonDim.end,
  format: (v) => v.toFixed(3),
  read: (h) => h.horizonDimEnd,
};

const HDRI_HORIZON_DIM_MIN_SPEC: HdriSpec = {
  id: 'dev-hdri-horizon-dim-min',
  label: 'Horizon dim min',
  min: 0,
  max: 1,
  step: 0.01,
  defaultValue: NIGHT_HDRI.horizonDim.min,
  format: (v) => v.toFixed(2),
  read: (h) => h.horizonDimMin,
};

export const HDRI_SPECS: HdriSpec[] = [
  HDRI_INTENSITY_SPEC,
  HDRI_ROTATION_SPEC,
  HDRI_FADE_START_SPEC,
  HDRI_FADE_END_SPEC,
  HDRI_HORIZON_DIM_START_SPEC,
  HDRI_HORIZON_DIM_END_SPEC,
  HDRI_HORIZON_DIM_MIN_SPEC,
];

export function nightHdriSubsectionHtml(): string {
  return `
      <details class="dev-subsection" id="dev-sky-hdri-subsection">
        <summary>Night HDRI</summary>
        <div class="dev-section-body" id="dev-sky-hdri-rows"></div>
        <p class="dev-hint">HDRI weight fades by sun elevation: full at/below ${NIGHT_HDRI.fadeElevationStart}°, off at/above ${NIGHT_HDRI.fadeElevationEnd}° (day cycle peaks at ${VISUAL.sky.cycle.peakElevationDeg}°). Use Render debug to log weight.</p>
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
  const tuning = sky.getNightHdriTuning();
  syncSpecs(panel, HDRI_SPECS, (s) => s.read(tuning));
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
  disposers.push(
    bindRange(
      panel,
      HDRI_HORIZON_DIM_START_SPEC.id,
      `${HDRI_HORIZON_DIM_START_SPEC.id}-out`,
      HDRI_HORIZON_DIM_START_SPEC.format,
      (v) => {
        sky.setNightHdriTuning({ horizonDimStart: v });
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      HDRI_HORIZON_DIM_END_SPEC.id,
      `${HDRI_HORIZON_DIM_END_SPEC.id}-out`,
      HDRI_HORIZON_DIM_END_SPEC.format,
      (v) => {
        sky.setNightHdriTuning({ horizonDimEnd: v });
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      HDRI_HORIZON_DIM_MIN_SPEC.id,
      `${HDRI_HORIZON_DIM_MIN_SPEC.id}-out`,
      HDRI_HORIZON_DIM_MIN_SPEC.format,
      (v) => {
        sky.setNightHdriTuning({ horizonDimMin: v });
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
