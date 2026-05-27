// src/ui/dev/devPanelClouds.ts — three horizon cloud rings (DEV)
import { devSettings } from '../../core/GameState';
import { CLOUD_DEV_DEFAULTS, resetCloudDev } from '../../world/cloud/cloudDevDefaults';
import {
  bindRange,
  bindRangeOnChange,
  injectRangeRows,
  mountSection,
  syncSlider,
  syncSpecs,
  type RangeSpec,
} from './bindRange';

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

interface GlobalCloudSpec extends RangeSpec {
  rebuild: boolean;
}

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
  injectRangeRows(host, GLOBAL_CLOUD_SPECS);
}

function ringSpecsFor(ringIndex: number): RangeSpec[] {
  const r = devSettings.clouds.rings[ringIndex];
  return RING_FIELD_SPECS.map((f) => ({
    id: `dev-cloud-r${ringIndex}-${f.id}`,
    label: f.label,
    min: f.min,
    max: f.max,
    step: f.step,
    defaultValue: r[f.key] as number,
    format: f.format,
  }));
}

function injectRingPanels(panel: HTMLDivElement): void {
  for (let i = 0; i < 3; i++) {
    const host = panel.querySelector(`[data-cloud-ring="${i}"]`);
    if (!host) continue;
    injectRangeRows(host, ringSpecsFor(i));
  }
}

function syncRingPanel(panel: HTMLDivElement, ringIndex: number): void {
  const r = devSettings.clouds.rings[ringIndex];
  for (const f of RING_FIELD_SPECS) {
    syncSlider(
      panel,
      `dev-cloud-r${ringIndex}-${f.id}`,
      `dev-cloud-r${ringIndex}-${f.id}-out`,
      r[f.key],
      f.format,
    );
  }
}

function bindRingPanel(panel: HTMLDivElement, ringIndex: number): Array<() => void> {
  const c = devSettings.clouds;
  // Use a getter so post-reset ring references stay current.
  const ring = () => c.rings[ringIndex];

  syncRingPanel(panel, ringIndex);

  const disposers: Array<() => void> = [];
  for (const f of RING_FIELD_SPECS) {
    const id = `dev-cloud-r${ringIndex}-${f.id}`;
    const outId = `dev-cloud-r${ringIndex}-${f.id}-out`;
    const write = (v: number) => {
      (ring()[f.key] as number) = f.integer ? Math.round(v) : v;
    };

    if (f.rebuild) {
      disposers.push(
        bindRangeOnChange(panel, id, outId, f.format, (v) => {
          write(v);
          c.dirty = true;
        }),
      );
    } else {
      disposers.push(
        bindRange(panel, id, outId, f.format, (v) => {
          write(v);
          c.liveDirty = true;
        }),
      );
    }
  }
  return disposers;
}

const GLOBAL_CLOUD_KEY_MAP: Record<string, keyof typeof devSettings.clouds> = {
  'dev-cloud-night-alpha': 'nightAlphaMul',
  'dev-cloud-alpha-power': 'alphaPower',
  'dev-cloud-color-threshold': 'colorDayThreshold',
  'dev-cloud-night-tint': 'nightTintDarkness',
  'dev-cloud-ring-rot': 'ringRotationDeg',
  'dev-cloud-rot-jitter': 'rotationJitter',
};

export function initDevPanelClouds(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-clouds',
    title: 'Cloud rings',
    open: false,
    body: `
      <p class="dev-hint">Three horizon tiers (like water rings). Layout sliders rebuild on release.</p>
      <p class="dev-hint">Atmosphere (live): night fade and sky tint match.</p>
      <div id="dev-cloud-globals"></div>

      <details class="dev-subsection" open>
        <summary>Near ring (shore)</summary>
        <div class="dev-section-body" data-cloud-ring="0"></div>
      </details>
      <details class="dev-subsection" open>
        <summary>Mid ring</summary>
        <div class="dev-section-body" data-cloud-ring="1"></div>
      </details>
      <details class="dev-subsection" open>
        <summary>Far ring (horizon)</summary>
        <div class="dev-section-body" data-cloud-ring="2"></div>
      </details>

      <div class="dev-actions">
        <button type="button" id="dev-cloud-reset">Reset clouds</button>
      </div>
    `,
  });
  if (!body) return () => {};

  injectGlobalSliders(panel);
  injectRingPanels(panel);
  const c = devSettings.clouds;

  const syncGlobalUi = () => {
    syncSpecs(panel, GLOBAL_CLOUD_SPECS, (s) => c[GLOBAL_CLOUD_KEY_MAP[s.id]] as number);
  };

  syncGlobalUi();
  const disposers: Array<() => void> = [];
  disposers.push(...bindRingPanel(panel, 0));
  disposers.push(...bindRingPanel(panel, 1));
  disposers.push(...bindRingPanel(panel, 2));

  for (const s of GLOBAL_CLOUD_SPECS) {
    const key = GLOBAL_CLOUD_KEY_MAP[s.id];
    if (s.rebuild) {
      disposers.push(
        bindRangeOnChange(panel, s.id, `${s.id}-out`, s.format, (v) => {
          (c[key] as number) = v;
          c.dirty = true;
        }),
      );
    } else {
      disposers.push(
        bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
          (c[key] as number) = v;
          c.liveDirty = true;
        }),
      );
    }
  }

  const resetBtn = panel.querySelector('#dev-cloud-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetCloudDev(c);
    syncGlobalUi();
    for (let i = 0; i < 3; i++) syncRingPanel(panel, i);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
