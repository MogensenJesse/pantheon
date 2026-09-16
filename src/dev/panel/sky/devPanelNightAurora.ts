// src/dev/panel/sky/devPanelNightAurora.ts — procedural aurora night sky (DEV)
import { VISUAL } from '../../../config/visualTuning';
import type { AuroraTuning } from '../../../rendering/sky/aurora/auroraRuntime';
import { nightHdriWeightForGameState } from '../../../rendering/sky/hdri/nightHdriBlend';
import type { SkySystemContext } from '../../../rendering/sky/SkySystem';
import { bindRange, injectRangeRows, type RangeSpec, syncSpecs } from '../../bindRange';

const NIGHT_AURORA = VISUAL.sky.nightAurora;

export interface AuroraSpec extends RangeSpec {
  read: (tuning: Readonly<AuroraTuning>) => number;
}

const AURORA_INTENSITY_SPEC: AuroraSpec = {
  id: 'dev-aurora-intensity',
  label: 'Aurora intensity',
  min: 0,
  max: 3,
  step: 0.01,
  defaultValue: NIGHT_AURORA.intensity,
  format: (v) => v.toFixed(2),
  read: (a) => a.intensity,
};

const AURORA_STRENGTH_SPEC: AuroraSpec = {
  id: 'dev-aurora-strength',
  label: 'Aurora strength',
  min: 0,
  max: 2,
  step: 0.01,
  defaultValue: NIGHT_AURORA.auroraStrength,
  format: (v) => v.toFixed(2),
  read: (a) => a.auroraStrength,
};

const STAR_STRENGTH_SPEC: AuroraSpec = {
  id: 'dev-aurora-star-strength',
  label: 'Star strength',
  min: 0,
  max: 2,
  step: 0.01,
  defaultValue: NIGHT_AURORA.starStrength,
  format: (v) => v.toFixed(2),
  read: (a) => a.starStrength,
};

const TIME_SCALE_SPEC: AuroraSpec = {
  id: 'dev-aurora-time-scale',
  label: 'Time scale',
  min: 0,
  max: 4,
  step: 0.01,
  defaultValue: NIGHT_AURORA.timeScale,
  format: (v) => v.toFixed(2),
  read: (a) => a.timeScale,
};

export const AURORA_SPECS: AuroraSpec[] = [
  AURORA_INTENSITY_SPEC,
  AURORA_STRENGTH_SPEC,
  STAR_STRENGTH_SPEC,
  TIME_SCALE_SPEC,
];

export function nightAuroraSubsectionHtml(): string {
  return `
      <details class="dev-subsection" id="dev-sky-aurora-subsection">
        <summary>Night aurora</summary>
        <div class="dev-section-body">
          <label class="dev-row dev-row-check">
            <span>Enabled</span>
            <input type="checkbox" id="dev-aurora-enabled" />
          </label>
          <div id="dev-sky-aurora-rows"></div>
        </div>
        <p class="dev-hint">Procedural Nimitz aurora + stars replaces the night HDRI skybox when enabled. Night HDRI envMap still binds for reflections when assets exist. Weight fades with the same sun-elevation curve as Night HDRI.</p>
      </details>`;
}

export function setupNightAuroraSubsection(panel: HTMLDivElement, sky: SkySystemContext): void {
  const host = panel.querySelector('#dev-sky-aurora-rows');
  if (host) injectRangeRows(host, AURORA_SPECS);
  const enabled = panel.querySelector('#dev-aurora-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = sky.getAuroraTuning().enabled;
}

export function syncNightAuroraPanel(panel: HTMLDivElement, sky: SkySystemContext): void {
  const tuning = sky.getAuroraTuning();
  syncSpecs(panel, AURORA_SPECS, (s) => s.read(tuning));
  const enabled = panel.querySelector('#dev-aurora-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = tuning.enabled;
}

export function bindNightAuroraPanel(panel: HTMLDivElement, sky: SkySystemContext): () => void {
  const disposers: Array<() => void> = [];

  const enabled = panel.querySelector('#dev-aurora-enabled') as HTMLInputElement | null;
  if (enabled) {
    const onEnabled = () => {
      sky.setAuroraTuning({ enabled: enabled.checked });
      sky.setNightHdriWeight(nightHdriWeightForGameState());
    };
    enabled.addEventListener('change', onEnabled);
    disposers.push(() => enabled.removeEventListener('change', onEnabled));
  }

  disposers.push(
    bindRange(
      panel,
      AURORA_INTENSITY_SPEC.id,
      `${AURORA_INTENSITY_SPEC.id}-out`,
      AURORA_INTENSITY_SPEC.format,
      (v) => {
        sky.setAuroraTuning({ intensity: v });
        sky.setNightHdriWeight(nightHdriWeightForGameState());
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      AURORA_STRENGTH_SPEC.id,
      `${AURORA_STRENGTH_SPEC.id}-out`,
      AURORA_STRENGTH_SPEC.format,
      (v) => {
        sky.setAuroraTuning({ auroraStrength: v });
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      STAR_STRENGTH_SPEC.id,
      `${STAR_STRENGTH_SPEC.id}-out`,
      STAR_STRENGTH_SPEC.format,
      (v) => {
        sky.setAuroraTuning({ starStrength: v });
      },
    ),
  );
  disposers.push(
    bindRange(
      panel,
      TIME_SCALE_SPEC.id,
      `${TIME_SCALE_SPEC.id}-out`,
      TIME_SCALE_SPEC.format,
      (v) => {
        sky.setAuroraTuning({ timeScale: v });
      },
    ),
  );

  return () => {
    for (const fn of disposers) fn();
  };
}

export function resetNightAuroraPanel(sky: SkySystemContext): void {
  sky.resetAuroraTuning();
  sky.setNightHdriWeight(nightHdriWeightForGameState());
}
