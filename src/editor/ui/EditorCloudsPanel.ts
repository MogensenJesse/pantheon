// src/editor/ui/EditorCloudsPanel.ts — cumulus deck controls in the map editor

import { CLOUD_LIFE_SPECS } from '../../dev/panel/sky/devPanelCloudsSpecs';
import type { MapCumulusDeck } from '../../map/MapTypes';
import { getLiveCloudSettings, setCloudDevOverride } from '../../rendering/clouds/cloudDevState';
import {
  CUMULUS_DECK_SLIDERS,
  type CumulusDeckSliderKey,
} from '../../rendering/clouds/cumulusDeckSliders';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';

export interface EditorCloudsDebugViews {
  coverage: boolean;
  clusters: boolean;
  fade: boolean;
}

export interface EditorCloudsPanelHandlers {
  getDeck: () => MapCumulusDeck;
  onDeckChange: (partial: Partial<MapCumulusDeck>) => void;
  getAnimate: () => boolean;
  onAnimate: (animate: boolean) => void;
  getDebugViews: () => EditorCloudsDebugViews;
  onDebugViewsChange: (views: EditorCloudsDebugViews) => void;
}

type EditorDeckSliderKey = Exclude<CumulusDeckSliderKey, 'sunPhase'>;

interface SliderSpec {
  key: EditorDeckSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  section: Exclude<(typeof CUMULUS_DECK_SLIDERS)[number]['section'], 'time'>;
  hint?: string;
  format: (value: number) => string;
}

const SECTIONS: {
  id: Exclude<SliderSpec['section'], 'time'> | 'debug';
  title: string;
  note: string;
}[] = [
  {
    id: 'banks',
    title: 'Banks',
    note: 'Where the weather pattern places clouds.',
  },
  {
    id: 'height',
    title: 'Height',
    note: 'Shared deck altitude.',
  },
  {
    id: 'extent',
    title: 'Extent',
    note: 'How wide the deck is, and how far clouds fade at the edge.',
  },
  {
    id: 'wind',
    title: 'Wind',
    note: 'Animate runs this preview clock. Cotton keeps moving from the shader clock.',
  },
  {
    id: 'debug',
    title: 'Debug',
    note: 'Heatmap and markers draw on the preview. Fade field recolors the clouds: white is present, red would be invisible, and nothing is hidden.',
  },
];

function formatDeckValue(key: CumulusDeckSliderKey, value: number): string {
  if (key === 'density') return value.toFixed(3);
  if (key === 'coverage' || key === 'supercluster' || key === 'bankSoftness')
    return value.toFixed(2);
  if (key === 'windSpeed' || key === 'deckYBiasM') return value.toFixed(1);
  return value.toFixed(0);
}

const SLIDERS: SliderSpec[] = CUMULUS_DECK_SLIDERS.flatMap((spec) => {
  if (spec.section === 'time' || spec.key === 'sunPhase') return [];
  return [
    {
      key: spec.key,
      label: spec.label,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      section: spec.section,
      hint: spec.hint,
      format: (value: number) => formatDeckValue(spec.key, value),
    },
  ];
});

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
  const lifeInputs = new Map<(typeof CLOUD_LIFE_SPECS)[number]['key'], HTMLInputElement>();
  const animate = document.createElement('input');
  animate.type = 'checkbox';
  const coverage = document.createElement('input');
  coverage.type = 'checkbox';
  const clusters = document.createElement('input');
  clusters.type = 'checkbox';
  const fade = document.createElement('input');
  fade.type = 'checkbox';

  const appendSlider = (body: HTMLElement, spec: SliderSpec): void => {
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
      handlers.onDeckChange({ [spec.key]: value });
    });
    row.append(name, out, input);
    body.append(row);
    if (spec.hint) {
      const hint = document.createElement('p');
      hint.className = 'editor-cloud-hint';
      hint.textContent = spec.hint;
      body.append(hint);
    }
    inputs.set(spec.key, input);
  };

  const appendCheck = (body: HTMLElement, input: HTMLInputElement, label: string): void => {
    const row = document.createElement('label');
    row.className = 'editor-cloud-check';
    row.append(input, document.createTextNode(label));
    body.append(row);
  };

  const lifeDetails = document.createElement('details');
  lifeDetails.className = 'editor-panel-section';
  lifeDetails.open = true;
  const lifeSummary = document.createElement('summary');
  lifeSummary.textContent = 'Life';
  const lifeBody = document.createElement('div');
  lifeBody.className = 'editor-panel-section-body';
  const lifeNote = document.createElement('p');
  lifeNote.className = 'editor-hint-copy';
  lifeNote.textContent =
    'Lobes shear and towers rise. Small clouds fade together; large masses stay solid. Fade field keeps clouds drawn: white is present, red would be invisible. Not saved with the map.';
  lifeBody.append(lifeNote);
  for (const spec of CLOUD_LIFE_SPECS) {
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
      setCloudDevOverride(spec.key, value);
    });
    row.append(name, out, input);
    lifeBody.append(row);
    lifeInputs.set(spec.key, input);
  }
  lifeDetails.append(lifeSummary, lifeBody);

  for (const section of SECTIONS) {
    const details = document.createElement('details');
    details.className = 'editor-panel-section';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = section.title;
    const body = document.createElement('div');
    body.className = 'editor-panel-section-body';
    const note = document.createElement('p');
    note.className = 'editor-hint-copy';
    note.textContent = section.note;
    body.append(note);
    if (section.id === 'debug') {
      appendCheck(body, coverage, 'Coverage heatmap');
      appendCheck(body, clusters, 'Cluster markers');
      appendCheck(body, fade, 'Fade field');
    } else {
      for (const spec of SLIDERS) {
        if (spec.section === section.id) appendSlider(body, spec);
      }
      if (section.id === 'wind') appendCheck(body, animate, 'Animate wind');
    }
    details.append(summary, body);
    root.append(details);
    if (section.id === 'wind') root.append(lifeDetails);
  }

  if (inputs.size !== SLIDERS.length) {
    throw new Error('EditorCloudsPanel: a deck slider has no section');
  }

  animate.addEventListener('change', () => handlers.onAnimate(animate.checked));
  const publishDebug = (): void => {
    handlers.onDebugViewsChange({
      coverage: coverage.checked,
      clusters: clusters.checked,
      fade: fade.checked,
    });
  };
  coverage.addEventListener('change', publishDebug);
  clusters.addEventListener('change', publishDebug);
  fade.addEventListener('change', publishDebug);

  const unsub = store.subscribe((state) => {
    root.hidden = state.tool !== 'clouds';
  });

  const sync = (): void => {
    const deck = handlers.getDeck();
    for (const spec of SLIDERS) {
      const input = inputs.get(spec.key);
      if (!input) continue;
      const value = deck[spec.key];
      if (document.activeElement !== input) input.value = String(value);
      const out = input.parentElement?.querySelector('output');
      if (out) out.textContent = spec.format(value);
    }
    animate.checked = handlers.getAnimate();
    const views = handlers.getDebugViews();
    coverage.checked = views.coverage;
    clusters.checked = views.clusters;
    fade.checked = views.fade;
    const live = getLiveCloudSettings();
    for (const spec of CLOUD_LIFE_SPECS) {
      const input = lifeInputs.get(spec.key);
      if (!input || document.activeElement === input) continue;
      const value = live[spec.key];
      if (typeof value !== 'number') continue;
      input.value = String(value);
      const out = input.parentElement?.querySelector('output');
      if (out) out.textContent = spec.format(value);
    }
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
