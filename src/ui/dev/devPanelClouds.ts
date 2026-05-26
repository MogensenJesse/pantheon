// src/ui/dev/devPanelClouds.ts — three horizon cloud rings (DEV)
import { devSettings } from '../../core/GameState';
import { CLOUD_HORIZON_RING_LABELS } from '../../world/cloud/cloudHorizonRing';
import { resetCloudDev } from '../../world/cloud/cloudDevDefaults';
import { bindRange, bindRangeOnChange, syncSlider } from './bindRange';

const RING_FIELD_SPECS = [
  { key: 'rCenter' as const, label: 'Radius', id: 'radius', min: 120, max: 550, step: 5, rebuild: true, format: (v: number) => String(Math.round(v)) },
  { key: 'rSpread' as const, label: 'Band width', id: 'spread', min: 20, max: 120, step: 5, rebuild: true, format: (v: number) => String(Math.round(v)) },
  { key: 'clusters' as const, label: 'Clusters', id: 'clusters', min: 4, max: 80, step: 1, rebuild: true, format: (v: number) => String(Math.round(v)) },
  { key: 'staggeredClusters' as const, label: 'Staggered', id: 'stagger', min: 0, max: 48, step: 1, rebuild: true, format: (v: number) => String(Math.round(v)) },
  { key: 'layersPerCluster' as const, label: 'Layers', id: 'layers', min: 1, max: 6, step: 1, rebuild: true, format: (v: number) => String(Math.round(v)) },
  { key: 'puffOpacity' as const, label: 'Opacity', id: 'opacity', min: 0.2, max: 1.2, step: 0.02, rebuild: false, format: (v: number) => v.toFixed(2) },
  { key: 'puffAlphaMax' as const, label: 'Alpha max', id: 'alpha', min: 0.2, max: 1, step: 0.02, rebuild: false, format: (v: number) => v.toFixed(2) },
] as const;

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
  const ring = () => c.rings[ringIndex];

  syncRingPanel(panel, ringIndex);

  for (const f of RING_FIELD_SPECS) {
    const id = `dev-cloud-r${ringIndex}-${f.id}`;
    const outId = `dev-cloud-r${ringIndex}-${f.id}-out`;
    const apply = (v: number) => {
      const r = ring();
      if (f.key === 'clusters' || f.key === 'staggeredClusters' || f.key === 'layersPerCluster') {
        (r[f.key] as number) = Math.round(v);
      } else if (f.key === 'rCenter' || f.key === 'rSpread') {
        (r[f.key] as number) = Math.round(v);
      } else {
        (r[f.key] as number) = v;
      }
    };

    if (f.rebuild) {
      bindRangeOnChange(panel, id, outId, f.format, (v) => {
        apply(v);
        c.dirty = true;
      });
    } else {
      bindRange(panel, id, outId, f.format, (v) => {
        apply(v);
      });
    }
  }
}

export function initDevPanelClouds(panel: HTMLDivElement): void {
  injectRingPanels(panel);
  const c = devSettings.clouds;

  const syncGlobalUi = () => {
    syncSlider(panel, 'dev-cloud-ring-rot', 'dev-cloud-ring-rot-out', c.ringRotationDeg, (v) => `${Math.round(v)}°`);
    syncSlider(panel, 'dev-cloud-alpha-min', 'dev-cloud-alpha-min-out', c.puffAlphaMin, (v) => v.toFixed(2));
    syncSlider(panel, 'dev-cloud-rot-jitter', 'dev-cloud-rot-jitter-out', c.rotationJitter, (v) => v.toFixed(2));
    for (let i = 0; i < 3; i++) {
      const host = panel.querySelector(`[data-cloud-ring="${i}"]`);
      const summary = host?.closest('details')?.querySelector('summary');
      if (summary) summary.textContent = CLOUD_HORIZON_RING_LABELS[i];
    }
  };

  syncGlobalUi();
  bindRingPanel(panel, 0);
  bindRingPanel(panel, 1);
  bindRingPanel(panel, 2);

  bindRange(panel, 'dev-cloud-ring-rot', 'dev-cloud-ring-rot-out', (v) => `${Math.round(v)}°`, (v) => {
    c.ringRotationDeg = v;
  });
  bindRange(panel, 'dev-cloud-alpha-min', 'dev-cloud-alpha-min-out', (v) => v.toFixed(2), (v) => {
    c.puffAlphaMin = v;
  });
  bindRangeOnChange(panel, 'dev-cloud-rot-jitter', 'dev-cloud-rot-jitter-out', (v) => v.toFixed(2), (v) => {
    c.rotationJitter = v;
    c.dirty = true;
  });

  panel.querySelector('#dev-cloud-reset')?.addEventListener('click', () => {
    resetCloudDev(c);
    syncGlobalUi();
    for (let i = 0; i < 3; i++) syncRingPanel(panel, i);
  });
}
