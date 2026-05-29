// src/ui/dev/devPanelWater.ts — live WaterMesh look knobs (DEV)
// Writes to devSettings.water; syncPantheonWater reads it every frame, so no
// direct mesh reference is needed (mirrors the cloud-settings pattern).
import { devSettings } from '../../core/GameState';
import { resetWaterDev, WATER_DEV_DEFAULTS } from '../../world/water/waterDevDefaults';
import { bindRange, mountSection, syncSlider, type RangeSpec } from './bindRange';

const WATER_SPECS: RangeSpec[] = [
  { id: 'dev-water-size', label: 'Ripple scale', min: 0.5, max: 12, step: 0.1, defaultValue: WATER_DEV_DEFAULTS.size, format: (v) => v.toFixed(1) },
  { id: 'dev-water-alpha', label: 'Opacity', min: 0.4, max: 1, step: 0.01, defaultValue: WATER_DEV_DEFAULTS.alpha, format: (v) => v.toFixed(2) },
  { id: 'dev-water-distortion-day', label: 'Distortion (day)', min: 0, max: 8, step: 0.1, defaultValue: WATER_DEV_DEFAULTS.distortionDay, format: (v) => v.toFixed(1) },
  { id: 'dev-water-distortion-night', label: 'Distortion (night)', min: 0, max: 8, step: 0.1, defaultValue: WATER_DEV_DEFAULTS.distortionNight, format: (v) => v.toFixed(1) },
];

const KEY_MAP: Record<string, keyof typeof WATER_DEV_DEFAULTS> = {
  'dev-water-size': 'size',
  'dev-water-alpha': 'alpha',
  'dev-water-distortion-day': 'distortionDay',
  'dev-water-distortion-night': 'distortionNight',
};

function syncUi(panel: HTMLDivElement): void {
  for (const s of WATER_SPECS) {
    syncSlider(panel, s.id, `${s.id}-out`, devSettings.water[KEY_MAP[s.id]], s.format);
  }
}

export function initDevPanelWater(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-water',
    title: 'Water',
    open: false,
    body: `
      <p class="dev-hint">Reflective ocean (WaterMesh). All live; colours are config-driven.</p>
      ${WATER_SPECS.map(
        (s) => `
        <label class="dev-row">
          <span>${s.label}</span>
          <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
          <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
        </label>`,
      ).join('')}
      <div class="dev-actions">
        <button type="button" id="dev-water-reset">Reset water</button>
      </div>
    `,
  });
  if (!body) return () => {};

  syncUi(panel);

  const water = devSettings.water as Record<keyof typeof WATER_DEV_DEFAULTS, number>;
  const disposers: Array<() => void> = [];
  for (const s of WATER_SPECS) {
    const key = KEY_MAP[s.id];
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        water[key] = v;
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-water-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetWaterDev(devSettings.water);
    syncUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
