// src/ui/dev/devPanelClouds.ts — three horizon cloud rings (DEV)
import { devSettings } from '../../core/GameState';
import { CLOUD_DEV_DEFAULTS, resetCloudDev } from '../../world/cloud/cloudDevDefaults';
import { bindRange, bindRangeOnChange, syncSlider } from './bindRange';

const RING_FIELD_SPECS = [
  { key: 'rCenter' as const, label: 'Radius', id: 'radius', min: 120, max: 550, step: 5, rebuild: true, integer: true, format: (v: number) => String(Math.round(v)) },
  { key: 'rSpread' as const, label: 'Band width', id: 'spread', min: 20, max: 120, step: 5, rebuild: true, integer: true, format: (v: number) => String(Math.round(v)) },
  { key: 'clusters' as const, label: 'Clusters', id: 'clusters', min: 4, max: 80, step: 1, rebuild: true, integer: true, format: (v: number) => String(Math.round(v)) },
  { key: 'staggeredClusters' as const, label: 'Staggered', id: 'stagger', min: 0, max: 48, step: 1, rebuild: true, integer: true, format: (v: number) => String(Math.round(v)) },
  { key: 'layersPerCluster' as const, label: 'Layers', id: 'layers', min: 1, max: 6, step: 1, rebuild: true, integer: true, format: (v: number) => String(Math.round(v)) },
  { key: 'puffOpacity' as const, label: 'Opacity', id: 'opacity', min: 0.2, max: 1.2, step: 0.02, rebuild: false, integer: false, format: (v: number) => v.toFixed(2) },
  { key: 'puffAlphaMin' as const, label: 'Alpha min', id: 'alphamin', min: 0.1, max: 0.8, step: 0.02, rebuild: false, integer: false, format: (v: number) => v.toFixed(2) },
  { key: 'puffAlphaMax' as const, label: 'Alpha max', id: 'alphamax', min: 0.2, max: 1, step: 0.02, rebuild: false, integer: false, format: (v: number) => v.toFixed(2) },
] as const;

type GlobalCloudSpec = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (v: number) => string;
  rebuild: boolean;
};

const GLOBAL_CLOUD_SPECS: GlobalCloudSpec[] = [
  { id: 'dev-cloud-night-alpha', label: 'Night visibility', min: 0.05, max: 0.5, step: 0.01, defaultValue: CLOUD_DEV_DEFAULTS.nightAlphaMul, format: (v) => v.toFixed(2), rebuild: false },
  { id: 'dev-cloud-alpha-power', label: 'Night fade curve', min: 1, max: 4, step: 0.1, defaultValue: CLOUD_DEV_DEFAULTS.alphaPower, format: (v) => v.toFixed(2), rebuild: false },
  { id: 'dev-cloud-color-threshold', label: 'Day color onset', min: 0.1, max: 0.6, step: 0.02, defaultValue: CLOUD_DEV_DEFAULTS.colorDayThreshold, format: (v) => v.toFixed(2), rebuild: false },
  { id: 'dev-cloud-night-tint', label: 'Night tint darkness', min: 0, max: 1, step: 0.02, defaultValue: CLOUD_DEV_DEFAULTS.nightTintDarkness, format: (v) => v.toFixed(2), rebuild: false },
  { id: 'dev-cloud-ring-rot', label: 'All rings rotation', min: 0, max: 360, step: 1, defaultValue: CLOUD_DEV_DEFAULTS.ringRotationDeg, format: (v) => `${Math.round(v)}°`, rebuild: true },
  { id: 'dev-cloud-rot-jitter', label: 'Rotation jitter', min: 0, max: 2, step: 0.05, defaultValue: CLOUD_DEV_DEFAULTS.rotationJitter, format: (v) => v.toFixed(2), rebuild: true },
];

function injectGlobalSliders(panel: HTMLDivElement): void {
  const host = panel.querySelector('#dev-cloud-globals');
  if (!host) return;
  host.innerHTML = GLOBAL_CLOUD_SPECS.map(
    (s) => `
    <label class="dev-row">
      <span>${s.label}</span>
      <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
      <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
    </label>`,
  ).join('');
}

function injectRingPanels(panel: HTMLDivElement): void {
  for (let i = 0; i < 3; i++) {
    const host = panel.querySelector(`[data-cloud-ring="${i}"]`);
    if (!host) continue;
    const rows = RING_FIELD_SPECS.map(
      (f) => `
      <label class="dev-row">
        <span>${f.label}</span>
        <input type="range" id="dev-cloud-r${i}-${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" />
        <output id="dev-cloud-r${i}-${f.id}-out"></output>
      </label>`,
    ).join('');
    host.innerHTML = rows;
  }
}

function syncRingPanel(panel: HTMLDivElement, ringIndex: number): void {
  const r = devSettings.clouds.rings[ringIndex];
  for (const f of RING_FIELD_SPECS) {
    syncSlider(panel, `dev-cloud-r${ringIndex}-${f.id}`, `dev-cloud-r${ringIndex}-${f.id}-out`, r[f.key], f.format);
  }
}

function bindRingPanel(panel: HTMLDivElement, ringIndex: number): void {
  const c = devSettings.clouds;
  // Use a getter so post-reset ring references stay current.
  const ring = () => c.rings[ringIndex];

  syncRingPanel(panel, ringIndex);

  for (const f of RING_FIELD_SPECS) {
    const id = `dev-cloud-r${ringIndex}-${f.id}`;
    const outId = `dev-cloud-r${ringIndex}-${f.id}-out`;
    const write = (v: number) => {
      (ring()[f.key] as number) = f.integer ? Math.round(v) : v;
    };

    if (f.rebuild) {
      bindRangeOnChange(panel, id, outId, f.format, (v) => {
        write(v);
        c.dirty = true;
      });
    } else {
      bindRange(panel, id, outId, f.format, (v) => {
        write(v);
        c.liveDirty = true;
      });
    }
  }
}

const GLOBAL_CLOUD_KEY_MAP: Record<string, keyof typeof devSettings.clouds> = {
  'dev-cloud-night-alpha': 'nightAlphaMul',
  'dev-cloud-alpha-power': 'alphaPower',
  'dev-cloud-color-threshold': 'colorDayThreshold',
  'dev-cloud-night-tint': 'nightTintDarkness',
  'dev-cloud-ring-rot': 'ringRotationDeg',
  'dev-cloud-rot-jitter': 'rotationJitter',
};

export function initDevPanelClouds(panel: HTMLDivElement): void {
  injectGlobalSliders(panel);
  injectRingPanels(panel);
  const c = devSettings.clouds;

  const syncGlobalUi = () => {
    for (const s of GLOBAL_CLOUD_SPECS) {
      syncSlider(panel, s.id, `${s.id}-out`, c[GLOBAL_CLOUD_KEY_MAP[s.id]] as number, s.format);
    }
  };

  syncGlobalUi();
  bindRingPanel(panel, 0);
  bindRingPanel(panel, 1);
  bindRingPanel(panel, 2);

  for (const s of GLOBAL_CLOUD_SPECS) {
    const key = GLOBAL_CLOUD_KEY_MAP[s.id];
    if (s.rebuild) {
      bindRangeOnChange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        (c[key] as number) = v;
        c.dirty = true;
      });
    } else {
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        (c[key] as number) = v;
        c.liveDirty = true;
      });
    }
  }

  panel.querySelector('#dev-cloud-reset')?.addEventListener('click', () => {
    resetCloudDev(c);
    syncGlobalUi();
    for (let i = 0; i < 3; i++) syncRingPanel(panel, i);
  });
}
