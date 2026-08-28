// src/editor/ui/PlacePropertiesPanel.ts — Single/Brush/Fill placement options

import { getPaletteEntry } from '../../map/authoring/mapEntityCatalog';
import type { MapGrids } from '../../map/MapGrids';
import { BIOME_ID_LABELS, BiomeId, type BiomeIdValue } from '../../map/MapTypes';
import type { EditorPropMixModel } from '../core/EditorPropMixModel';
import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import { getPlaceOptions, setPlaceOptions } from '../place/placeOptions';
import { estimatePropBiomeFill } from '../tools/PropBiomeFill';
import { bindEditorCheckbox } from './controls/editorCheckbox';
import { bindEditorRange, syncEditorRangeValue } from './controls/editorRange';
import { humanizeLabel } from './editorText';

const FILL_BIOMES: BiomeIdValue[] = [
  BiomeId.Shore,
  BiomeId.Forest,
  BiomeId.Hills,
  BiomeId.Mountain,
  BiomeId.Meadow,
  BiomeId.Path,
];

export interface FillEstimateContext {
  grids: MapGrids;
  entityCount: number;
  worldSize: number;
  countPropsOnBiome: (biome: BiomeIdValue) => number;
  waterHeightNorm?: number;
}

export interface PlacePropertiesPanelHandlers {
  getBrushRadius: () => number;
  onBrushRadius: (radius: number) => void;
  onBrushDensity: (density: number) => void;
  onBrushSpacing: (spacingM: number) => void;
  onBrushBiome: (biome: BiomeIdValue) => void;
  onBrushSizeBias: (sizeBias01: number) => void;
  getFillEstimateContext: () => FillEstimateContext | null;
  onApplyBiomeFill: (opts: {
    biome: BiomeIdValue;
    mix: readonly string[];
    weights: Readonly<Record<string, number>>;
    density01: number;
    spacing: number;
    sizeBias01: number;
    replaceExisting: boolean;
  }) => void;
}

export interface PlacePropertiesPanelContext {
  refreshFillEstimate: () => void;
  dispose: () => void;
}

export function createPlacePropertiesPanel(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  mix: EditorPropMixModel,
  handlers: PlacePropertiesPanelHandlers,
): PlacePropertiesPanelContext {
  const root = document.createElement('div');
  root.innerHTML = `
    <label class="editor-check">
      <input type="checkbox" id="place-random-rot" />
      <span>Random rotation</span>
    </label>
    <label class="editor-check">
      <input type="checkbox" id="place-random-scale" />
      <span>Random scale</span>
    </label>
    <label id="place-scale-min-wrap" class="editor-range editor-hidden">Scale min
      <input type="range" id="place-scale-min" min="50" max="200" value="80" />
      <output id="place-scale-min-out">80%</output>
    </label>
    <label id="place-scale-max-wrap" class="editor-range editor-hidden">Scale max
      <input type="range" id="place-scale-max" min="50" max="200" value="120" />
      <output id="place-scale-max-out">120%</output>
    </label>
    <div data-brush-only class="editor-hidden">
      <label class="editor-range">Brush
        <input type="range" id="place-brush-radius" min="2" max="400" value="${handlers.getBrushRadius()}" />
        <output id="place-brush-radius-out">${handlers.getBrushRadius()}</output>
      </label>
      <label class="editor-range">Density
        <input type="range" id="brush-density" min="1" max="30" value="6" />
        <output id="brush-density-out">6</output>
      </label>
      <label class="editor-range">Spacing (m)
        <input type="range" id="brush-spacing" min="0" max="40" value="12" />
        <output id="brush-spacing-out">1.2m</output>
      </label>
      <label class="editor-range">
        Patch bias
        <input type="range" id="brush-size-bias" min="0" max="100" value="50" />
        <output id="brush-size-bias-out">50%</output>
      </label>
      <p class="editor-hint-copy">
        Patch bias densifies large biome interiors and thins small islands. 0% is uniform.
      </p>
      <label class="editor-range">
        <span>Biome</span>
        <select id="place-brush-biome"></select>
      </label>
    </div>
    <div data-fill-only class="editor-hidden">
      <label class="editor-range">
        Density
        <input type="range" id="fill-density" min="10" max="100" value="50" />
        <output id="fill-density-out">50%</output>
      </label>
      <label class="editor-range">
        Spacing (m)
        <input type="range" id="fill-spacing" min="2" max="80" value="16" />
        <output id="fill-spacing-out">16m</output>
      </label>
      <label class="editor-range">
        Patch bias
        <input type="range" id="fill-size-bias" min="0" max="100" value="50" />
        <output id="fill-size-bias-out">50%</output>
      </label>
      <p class="editor-hint-copy">
        Patch bias densifies large biome interiors and thins small islands. 0% is uniform.
      </p>
      <label class="editor-check" title="Remove props already on this biome before placing. Uncheck to add on top.">
        <input type="checkbox" id="fill-replace-existing" checked />
        <span>Replace existing</span>
      </label>
      <label class="editor-range">
        <span>Biome</span>
        <select id="place-fill-biome"></select>
      </label>
    </div>
    <div data-mix-only class="editor-hidden">
      <div id="place-mix-weights"></div>
    </div>
    <div data-fill-only class="editor-hidden">
      <p id="fill-estimate" class="editor-fill-estimate" aria-live="polite"></p>
      <button type="button" id="place-fill-apply" class="editor-primary-btn">Apply fill</button>
    </div>
  `;
  host.appendChild(root);

  const unbind: (() => void)[] = [];
  const scaleMinWrap = root.querySelector<HTMLElement>('#place-scale-min-wrap')!;
  const scaleMaxWrap = root.querySelector<HTMLElement>('#place-scale-max-wrap')!;
  const randomScale = root.querySelector<HTMLInputElement>('#place-random-scale')!;
  const brushOnly = root.querySelector<HTMLElement>('[data-brush-only]')!;
  const mixOnly = root.querySelector<HTMLElement>('[data-mix-only]')!;
  const fillOnly = [...root.querySelectorAll<HTMLElement>('[data-fill-only]')];
  const brushBiomeSelect = root.querySelector<HTMLSelectElement>('#place-brush-biome')!;
  const fillBiomeSelect = root.querySelector<HTMLSelectElement>('#place-fill-biome')!;
  const mixWeightsHost = root.querySelector<HTMLElement>('#place-mix-weights')!;
  const fillEstimateEl = root.querySelector<HTMLElement>('#fill-estimate')!;

  const appendBiomeOptions = (select: HTMLSelectElement) => {
    for (const id of FILL_BIOMES) {
      const opt = document.createElement('option');
      opt.value = String(id);
      opt.textContent = BIOME_ID_LABELS[id];
      if (id === BiomeId.Forest) opt.selected = true;
      select.appendChild(opt);
    }
  };
  appendBiomeOptions(brushBiomeSelect);
  appendBiomeOptions(fillBiomeSelect);
  handlers.onBrushBiome(Number(brushBiomeSelect.value) as BiomeIdValue);

  let fillDensity01 = 0.5;
  let fillSpacingM = 16;
  let fillSizeBias01 = 0.5;
  let fillReplaceExisting = true;

  const syncPlaceScaleChrome = () => {
    const showScale = randomScale.checked;
    scaleMinWrap.classList.toggle('editor-hidden', !showScale);
    scaleMaxWrap.classList.toggle('editor-hidden', !showScale);
  };

  const syncFillEstimate = () => {
    if (store.get().placeSubMode !== 'fill') {
      fillEstimateEl.textContent = '';
      return;
    }
    if (mix.getIds().length === 0) {
      fillEstimateEl.textContent = 'Shift+click props to build a mix first.';
      fillEstimateEl.classList.add('is-muted');
      return;
    }
    const ctx = handlers.getFillEstimateContext();
    if (!ctx) {
      fillEstimateEl.textContent = '';
      return;
    }
    const biome = Number(fillBiomeSelect.value) as BiomeIdValue;
    const est = estimatePropBiomeFill({
      grids: ctx.grids,
      worldSize: ctx.worldSize,
      biome,
      density01: fillDensity01,
      spacing: fillSpacingM,
      entityCount: ctx.entityCount,
      sizeBias01: fillSizeBias01,
      replaceExisting: fillReplaceExisting,
      propsOnBiome: ctx.countPropsOnBiome(biome),
      waterHeightNorm: ctx.waterHeightNorm,
    });
    if (est.eligibleCells === 0) {
      fillEstimateEl.textContent = '0 props — no eligible terrain in this biome.';
      fillEstimateEl.classList.add('is-muted');
      return;
    }
    fillEstimateEl.classList.remove('is-muted');
    const countStr = est.targetCount.toLocaleString();
    fillEstimateEl.textContent = est.saveCapped
      ? `~${countStr} props (save cap)`
      : `~${countStr} props`;
  };

  const usesMixWeights = (placeSubMode: string) =>
    placeSubMode === 'brush' || placeSubMode === 'fill';

  const syncMixChrome = () => {
    const state = store.get();
    const showMix =
      state.tool === 'place' && usesMixWeights(state.placeSubMode) && mix.getIds().length > 0;
    mixOnly.classList.toggle('editor-hidden', !showMix);
  };

  const syncMixWeights = () => {
    mixWeightsHost.replaceChildren();
    syncMixChrome();
    if (!usesMixWeights(store.get().placeSubMode) || mix.getIds().length === 0) {
      syncFillEstimate();
      return;
    }
    for (const id of mix.getIds()) {
      const weight = mix.getWeight(id);
      const row = document.createElement('label');
      row.className = 'editor-fill-weight-row';
      const name = document.createElement('span');
      name.textContent = humanizeLabel(getPaletteEntry(id)?.label ?? id);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '4';
      slider.step = '0.1';
      slider.value = String(weight);
      const out = document.createElement('output');
      out.textContent = weight.toFixed(1);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        mix.setWeight(id, v);
        out.textContent = v.toFixed(1);
      });
      row.appendChild(name);
      row.appendChild(slider);
      row.appendChild(out);
      mixWeightsHost.appendChild(row);
    }
    syncFillEstimate();
  };

  unbind.push(
    bindEditorCheckbox(
      root,
      'place-random-rot',
      () => getPlaceOptions().randomRotation,
      (v) => setPlaceOptions({ randomRotation: v }),
    ),
    bindEditorCheckbox(
      root,
      'place-random-scale',
      () => getPlaceOptions().randomScale,
      (v) => {
        setPlaceOptions({ randomScale: v });
        syncPlaceScaleChrome();
      },
    ),
    bindEditorRange(root, 'place-scale-min', (v) => `${v}%`, {
      onInput: (v) => setPlaceOptions({ scaleMinMul: v / 100 }),
    }),
    bindEditorRange(root, 'place-scale-max', (v) => `${v}%`, {
      onInput: (v) => setPlaceOptions({ scaleMaxMul: v / 100 }),
    }),
    bindEditorRange(root, 'place-brush-radius', String, { onInput: handlers.onBrushRadius }),
    bindEditorRange(root, 'brush-density', String, { onInput: handlers.onBrushDensity }),
    bindEditorRange(root, 'brush-spacing', (v) => `${(v / 10).toFixed(1)}m`, {
      onInput: (v) => handlers.onBrushSpacing(v / 10),
    }),
    bindEditorRange(root, 'brush-size-bias', (v) => `${Math.round(v)}%`, {
      onInput: (v) => handlers.onBrushSizeBias(v / 100),
    }),
    bindEditorRange(root, 'fill-density', (v) => `${Math.round(v)}%`, {
      onInput: (v) => {
        fillDensity01 = v / 100;
        syncFillEstimate();
      },
    }),
    bindEditorRange(root, 'fill-spacing', (v) => `${Math.round(v)}m`, {
      onInput: (v) => {
        fillSpacingM = v;
        syncFillEstimate();
      },
    }),
    bindEditorRange(root, 'fill-size-bias', (v) => `${Math.round(v)}%`, {
      onInput: (v) => {
        fillSizeBias01 = v / 100;
        syncFillEstimate();
      },
    }),
    bindEditorCheckbox(
      root,
      'fill-replace-existing',
      () => fillReplaceExisting,
      (v) => {
        fillReplaceExisting = v;
        syncFillEstimate();
      },
    ),
  );

  brushBiomeSelect.addEventListener('change', () => {
    handlers.onBrushBiome(Number(brushBiomeSelect.value) as BiomeIdValue);
  });
  fillBiomeSelect.addEventListener('change', syncFillEstimate);
  root.querySelector('#place-fill-apply')!.addEventListener('click', () => {
    handlers.onApplyBiomeFill({
      biome: Number(fillBiomeSelect.value) as BiomeIdValue,
      mix: mix.getIds(),
      weights: mix.getWeights(),
      density01: fillDensity01,
      spacing: fillSpacingM,
      sizeBias01: fillSizeBias01,
      replaceExisting: fillReplaceExisting,
    });
  });

  syncPlaceScaleChrome();

  const unsubMix = mix.subscribe(syncMixWeights);
  const unsubStore = store.subscribe((state) => {
    const place = state.tool === 'place';
    root.hidden = !place;
    brushOnly.classList.toggle('editor-hidden', !place || state.placeSubMode !== 'brush');
    for (const el of fillOnly) {
      el.classList.toggle('editor-hidden', !place || state.placeSubMode !== 'fill');
    }
    syncMixChrome();
    if (place && state.placeSubMode === 'brush') {
      syncEditorRangeValue(root, 'place-brush-radius', handlers.getBrushRadius(), String);
    }
    if (place && state.placeSubMode === 'fill') syncFillEstimate();
  });

  return {
    refreshFillEstimate: syncFillEstimate,
    dispose: () => {
      unsubMix();
      unsubStore();
      for (const fn of unbind) fn();
      root.remove();
    },
  };
}
