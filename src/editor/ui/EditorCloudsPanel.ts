// src/editor/ui/EditorCloudsPanel.ts — cumulus deck controls in the map editor
import type { MapCumulusDeck } from '../../map/MapTypes';
import { sunPositionFromCyclePhase } from '../../rendering/sky/sunCycle';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';

export interface EditorCloudsDebugViews {
  coverage: boolean;
  clusters: boolean;
}

export interface EditorCloudsPanelHandlers {
  getDeck: () => MapCumulusDeck;
  onDeckChange: (partial: Partial<MapCumulusDeck>) => void;
  getSunPhase: () => number;
  onSunPhase: (phase: number) => void;
  getAnimate: () => boolean;
  onAnimate: (animate: boolean) => void;
  getDebugViews: () => EditorCloudsDebugViews;
  onDebugViewsChange: (views: EditorCloudsDebugViews) => void;
}

interface SliderSpec {
  key: keyof MapCumulusDeck | 'sunPhase';
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

const SLIDERS: SliderSpec[] = [
  { key: 'coverage', label: 'Coverage', min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2) },
  { key: 'density', label: 'Density', min: 0, max: 1, step: 0.001, format: (v) => v.toFixed(3) },
  {
    key: 'supercluster',
    label: 'Supercluster',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'deckMinY',
    label: 'Min height (m)',
    min: 0,
    max: 800,
    step: 1,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'deckMaxY',
    label: 'Max height (m)',
    min: 0,
    max: 800,
    step: 1,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'deckYBiasM',
    label: 'Deck Y bias (m)',
    min: -40,
    max: 80,
    step: 0.5,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'spread',
    label: 'Spread (m)',
    min: 160,
    max: 1600,
    step: 10,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'edgeFadeM',
    label: 'Edge fade (m)',
    min: 0,
    max: 800,
    step: 1,
    format: (v) => v.toFixed(0),
  },
  {
    key: 'windSpeed',
    label: 'Wind speed',
    min: 0,
    max: 100,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  { key: 'particles', label: 'Particles', min: 4, max: 48, step: 1, format: (v) => v.toFixed(0) },
  {
    key: 'puffLayoutRadiusScale',
    label: 'Radius scale',
    min: 0.2,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'puffLayoutHeightScale',
    label: 'Height scale',
    min: 0.1,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'deckBaseFraction',
    label: 'Deck base fraction',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  { key: 'sunPhase', label: 'Sun', min: 0, max: 1, step: 0.001, format: formatSun },
];

function formatSun(phase: number): string {
  const pos = sunPositionFromCyclePhase(phase);
  return `${phase.toFixed(2)} · ${pos.elevationDeg.toFixed(0)}°`;
}

export interface EditorCloudsPanel {
  sync: () => void;
  dispose: () => void;
}

export function createEditorCloudsPanel(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  handlers: EditorCloudsPanelHandlers,
): EditorCloudsPanel {
  const root = document.createElement('div');
  root.className = 'editor-clouds-options';
  root.hidden = store.get().tool !== 'clouds';
  host.append(root);

  const inputs = new Map<SliderSpec['key'], HTMLInputElement>();
  for (const spec of SLIDERS) {
    const row = document.createElement('label');
    row.className = 'editor-cloud-row';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const out = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      out.textContent = spec.format(value);
      if (spec.key === 'sunPhase') handlers.onSunPhase(value);
      else handlers.onDeckChange({ [spec.key]: value });
    });
    row.append(name, out, input);
    root.append(row);
    inputs.set(spec.key, input);
  }

  const animate = document.createElement('input');
  animate.type = 'checkbox';
  const animateLabel = document.createElement('label');
  animateLabel.className = 'editor-cloud-check';
  animateLabel.append(animate, document.createTextNode('Animate wind'));
  animate.addEventListener('change', () => handlers.onAnimate(animate.checked));

  const coverage = document.createElement('input');
  coverage.type = 'checkbox';
  const coverageLabel = document.createElement('label');
  coverageLabel.className = 'editor-cloud-check';
  coverageLabel.append(coverage, document.createTextNode('Coverage heatmap'));
  const publishDebug = (): void => {
    handlers.onDebugViewsChange({ coverage: coverage.checked, clusters: clusters.checked });
  };
  coverage.addEventListener('change', publishDebug);

  const clusters = document.createElement('input');
  clusters.type = 'checkbox';
  const clustersLabel = document.createElement('label');
  clustersLabel.className = 'editor-cloud-check';
  clustersLabel.append(clusters, document.createTextNode('Cluster markers'));
  clusters.addEventListener('change', publishDebug);

  root.append(animateLabel, coverageLabel, clustersLabel);

  const unsub = store.subscribe((state) => {
    root.hidden = state.tool !== 'clouds';
  });

  const sync = (): void => {
    const deck = handlers.getDeck();
    for (const spec of SLIDERS) {
      const input = inputs.get(spec.key);
      if (!input) continue;
      const value = spec.key === 'sunPhase' ? handlers.getSunPhase() : deck[spec.key];
      if (document.activeElement !== input) input.value = String(value);
      const out = input.parentElement?.querySelector('output');
      if (out) out.textContent = spec.format(value);
    }
    animate.checked = handlers.getAnimate();
    const views = handlers.getDebugViews();
    coverage.checked = views.coverage;
    clusters.checked = views.clusters;
  };

  sync();

  return {
    sync,
    dispose: () => {
      unsub();
      root.remove();
    },
  };
}
