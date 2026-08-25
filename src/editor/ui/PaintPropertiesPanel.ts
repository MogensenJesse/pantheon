// src/editor/ui/PaintPropertiesPanel.ts — brush sliders + Auto biome rules

import { bindCheckbox, bindRange } from '../../dev/bindRange';
import {
  type BiomePaintRules,
  type BiomeRule,
  cloneBiomePaintRules,
  defaultBiomePaintRules,
  LAND_BIOME_RULE_KEYS,
  type LandBiomeRuleKey,
} from '../../map/authoring/applyBiomeRules';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import { asRangePanel } from './editorText';
import { syncEditorRange, wireEditorRange } from './wireEditorRange';

const RULE_LABELS: Record<LandBiomeRuleKey, string> = {
  shore: 'Shore',
  forest: 'Forest',
  meadow: 'Meadow',
  hills: 'Hills',
  mountain: 'Mountain',
};

type RuleField = keyof BiomeRule;

const RULE_FIELDS: {
  key: RuleField;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
}[] = [
  { key: 'weight', label: 'Weight', min: 0, max: 4, step: 0.1, decimals: 1 },
  { key: 'density', label: 'Density', min: 0, max: 1, step: 0.05, decimals: 2 },
  { key: 'heightMin', label: 'Height min', min: 0, max: 1, step: 0.01, decimals: 2 },
  { key: 'heightMax', label: 'Height max', min: 0, max: 1, step: 0.01, decimals: 2 },
  { key: 'slopeMin', label: 'Slope min', min: 0, max: 3, step: 0.05, decimals: 2 },
  { key: 'slopeMax', label: 'Slope max', min: 0, max: 3, step: 0.05, decimals: 2 },
];

function formatFixed(decimals: number): (v: number) => string {
  return (v) => v.toFixed(decimals);
}

function ruleRowHtml(
  biomeKey: LandBiomeRuleKey,
  field: (typeof RULE_FIELDS)[number],
  value: number,
): string {
  const id = `biome-rule-${biomeKey}-${field.key}`;
  return `
    <label class="editor-range">
      <span>${field.label}</span>
      <input type="range" id="${id}" min="${field.min}" max="${field.max}" step="${field.step}"
        value="${value}" data-biome-key="${biomeKey}" data-rule-field="${field.key}" />
      <output id="${id}-out">${value.toFixed(field.decimals)}</output>
    </label>
  `;
}

function biomeRuleSectionHtml(key: LandBiomeRuleKey, rule: BiomeRule, open: boolean): string {
  return `
    <details class="editor-panel-section" ${open ? 'open' : ''}>
      <summary>${RULE_LABELS[key]}</summary>
      <div class="editor-panel-section-body">
        ${RULE_FIELDS.map((field) => ruleRowHtml(key, field, rule[field.key])).join('')}
      </div>
    </details>
  `;
}

export interface PaintPropertiesPanelHandlers {
  getBrushRadius: () => number;
  getBrushHardness: () => number;
  onBrushRadius: (radius: number) => void;
  onBrushHardness: (hardness: number) => void;
  onApplyBiomeRules: (rules: BiomePaintRules) => void;
}

export interface PaintPropertiesPanelContext {
  dispose: () => void;
}

export function createPaintPropertiesPanel(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  handlers: PaintPropertiesPanelHandlers,
): PaintPropertiesPanelContext {
  const rules = defaultBiomePaintRules();
  const root = document.createElement('div');
  root.innerHTML = `
    <div data-brush-panel>
      <label class="editor-range">Brush
        <input type="range" id="paint-brush-radius" min="2" max="40" value="${handlers.getBrushRadius()}" />
        <output id="paint-brush-radius-out">${handlers.getBrushRadius()}</output>
      </label>
      <label class="editor-range">Hardness
        <input type="range" id="paint-brush-hardness" min="0" max="100" value="${Math.round(handlers.getBrushHardness() * 100)}" />
        <output id="paint-brush-hardness-out">${Math.round(handlers.getBrushHardness() * 100)}%</output>
      </label>
    </div>
    <div data-auto-panel class="editor-hidden">
      <p class="editor-hint-copy">
        Set weight and density per biome, then Apply. Height/slope bands pick eligible cells;
        density punches holes for the next-best biome. Slope max at 3 = no upper cap.
      </p>
      <label class="editor-check">
        <input type="checkbox" id="biome-rule-preserve-paths" />
        <span>Preserve paths</span>
      </label>
      <label class="editor-check">
        <input type="checkbox" id="biome-rule-auto-water" />
        <span>Auto water from height</span>
      </label>
      <label class="editor-range">
        <span>Water height</span>
        <input type="range" id="biome-rule-water-max" min="0" max="0.2" step="0.005"
          value="${rules.waterHeightMax}" />
        <output id="biome-rule-water-max-out">${rules.waterHeightMax.toFixed(3)}</output>
      </label>
      <label class="editor-range">
        <span>Seed</span>
        <input type="range" id="biome-rule-seed" min="1" max="100" step="1" value="${rules.seed}" />
        <output id="biome-rule-seed-out">${rules.seed}</output>
      </label>
      <label class="editor-range">
        <span>Noise scale</span>
        <input type="range" id="biome-rule-noise" min="1" max="128" step="1" value="${rules.noiseScale}" />
        <output id="biome-rule-noise-out">${rules.noiseScale}</output>
      </label>
      ${LAND_BIOME_RULE_KEYS.map((key) =>
        biomeRuleSectionHtml(key, rules[key], key === 'meadow' || key === 'mountain'),
      ).join('')}
      <button type="button" id="biome-rule-apply" class="editor-primary-btn">Apply biomes</button>
      <button type="button" id="biome-rule-reset" class="editor-secondary-btn">Reset rules</button>
    </div>
  `;
  host.appendChild(root);

  const brushPanel = root.querySelector<HTMLElement>('[data-brush-panel]')!;
  const autoPanel = root.querySelector<HTMLElement>('[data-auto-panel]')!;
  const unbind: (() => void)[] = [];
  const panel = asRangePanel(root);

  wireEditorRange(root, 'paint-brush-radius', String, handlers.onBrushRadius, unbind);
  wireEditorRange(
    root,
    'paint-brush-hardness',
    (v) => `${Math.round(v)}%`,
    (v) => handlers.onBrushHardness(v / 100),
    unbind,
  );

  const syncRuleSliders = () => {
    const water = root.querySelector<HTMLInputElement>('#biome-rule-water-max')!;
    const waterOut = root.querySelector<HTMLOutputElement>('#biome-rule-water-max-out')!;
    water.value = String(rules.waterHeightMax);
    waterOut.textContent = rules.waterHeightMax.toFixed(3);

    const seed = root.querySelector<HTMLInputElement>('#biome-rule-seed')!;
    const seedOut = root.querySelector<HTMLOutputElement>('#biome-rule-seed-out')!;
    seed.value = String(rules.seed);
    seedOut.textContent = String(rules.seed);

    const noise = root.querySelector<HTMLInputElement>('#biome-rule-noise')!;
    const noiseOut = root.querySelector<HTMLOutputElement>('#biome-rule-noise-out')!;
    noise.value = String(rules.noiseScale);
    noiseOut.textContent = String(rules.noiseScale);

    const paths = root.querySelector<HTMLInputElement>('#biome-rule-preserve-paths')!;
    const waterAuto = root.querySelector<HTMLInputElement>('#biome-rule-auto-water')!;
    paths.checked = rules.preservePaths;
    waterAuto.checked = rules.autoWater;

    for (const key of LAND_BIOME_RULE_KEYS) {
      for (const field of RULE_FIELDS) {
        const id = `biome-rule-${key}-${field.key}`;
        const slider = root.querySelector<HTMLInputElement>(`#${id}`);
        const out = root.querySelector<HTMLOutputElement>(`#${id}-out`);
        if (!slider || !out) continue;
        slider.value = String(rules[key][field.key]);
        out.textContent = Number(rules[key][field.key]).toFixed(field.decimals);
      }
    }
  };

  unbind.push(
    bindCheckbox(
      panel,
      'biome-rule-preserve-paths',
      () => rules.preservePaths,
      (v) => {
        rules.preservePaths = v;
      },
    ),
    bindCheckbox(
      panel,
      'biome-rule-auto-water',
      () => rules.autoWater,
      (v) => {
        rules.autoWater = v;
      },
    ),
    bindRange(panel, 'biome-rule-water-max', 'biome-rule-water-max-out', formatFixed(3), (v) => {
      rules.waterHeightMax = v;
    }),
    bindRange(panel, 'biome-rule-seed', 'biome-rule-seed-out', String, (v) => {
      rules.seed = Math.max(1, Math.floor(v) || 1);
    }),
    bindRange(panel, 'biome-rule-noise', 'biome-rule-noise-out', String, (v) => {
      rules.noiseScale = Math.max(1, v);
    }),
  );

  for (const key of LAND_BIOME_RULE_KEYS) {
    for (const field of RULE_FIELDS) {
      const id = `biome-rule-${key}-${field.key}`;
      unbind.push(
        bindRange(panel, id, `${id}-out`, formatFixed(field.decimals), (v) => {
          rules[key][field.key] = v;
        }),
      );
    }
  }

  root.querySelector('#biome-rule-apply')!.addEventListener('click', () => {
    handlers.onApplyBiomeRules(cloneBiomePaintRules(rules));
  });
  root.querySelector('#biome-rule-reset')!.addEventListener('click', () => {
    const next = defaultBiomePaintRules();
    rules.seed = next.seed;
    rules.noiseScale = next.noiseScale;
    rules.preservePaths = next.preservePaths;
    rules.autoWater = next.autoWater;
    rules.waterHeightMax = next.waterHeightMax;
    for (const key of LAND_BIOME_RULE_KEYS) {
      Object.assign(rules[key], next[key]);
    }
    syncRuleSliders();
  });

  const unsub = store.subscribe((state) => {
    const paint = state.tool === 'paint';
    root.hidden = !paint;
    brushPanel.classList.toggle('editor-hidden', !paint || state.paintSubMode !== 'brush');
    autoPanel.classList.toggle('editor-hidden', !paint || state.paintSubMode !== 'auto');
    if (paint && state.paintSubMode === 'brush') {
      syncEditorRange(root, 'paint-brush-radius', handlers.getBrushRadius(), String);
    }
  });

  return {
    dispose: () => {
      unsub();
      for (const fn of unbind) fn();
      root.remove();
    },
  };
}
