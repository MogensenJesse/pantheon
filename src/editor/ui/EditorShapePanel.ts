// src/editor/ui/EditorShapePanel.ts — sculpt shape sliders + Generate
import type { MapTerrainShape } from '../../map/MapTypes';

export type TerrainShapeChangePhase = 'input' | 'change';

type ShapeSliderDef = {
  key: keyof MapTerrainShape;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
};

const SHAPE_SLIDERS: ShapeSliderDef[] = [
  { key: 'heightScale', label: 'Height scale', min: 20, max: 200, step: 1, decimals: 0 },
  { key: 'frequency', label: 'Frequency', min: 0.002, max: 0.02, step: 0.0005, decimals: 4 },
  { key: 'octaves', label: 'Octaves', min: 1, max: 8, step: 1, decimals: 0 },
  { key: 'erosion', label: 'Erosion', min: 0, max: 1.5, step: 0.05, decimals: 2 },
  { key: 'warp', label: 'Warp', min: 0, max: 1, step: 0.05, decimals: 2 },
  { key: 'valleyBias', label: 'Valley bias', min: 1, max: 3, step: 0.1, decimals: 1 },
  { key: 'seaLevel', label: 'Sea level', min: 0, max: 0.4, step: 0.01, decimals: 2 },
  { key: 'talus', label: 'Talus', min: 0.2, max: 3, step: 0.05, decimals: 2 },
  { key: 'talusPasses', label: 'Talus passes', min: 0, max: 24, step: 1, decimals: 0 },
];

const SEED_SLIDER: ShapeSliderDef = {
  key: 'seed',
  label: 'Seed',
  min: 1,
  max: 100,
  step: 1,
  decimals: 0,
};

export interface EditorShapePanelHandlers {
  getTerrainShape: () => MapTerrainShape;
  onTerrainShapeChange: (shape: MapTerrainShape, phase: TerrainShapeChangePhase) => void;
  onTerrainSeedChange: (seed: number) => void;
  onGenerateTerrain: () => void;
}

export interface EditorShapePanelContext {
  panel: HTMLElement;
  sync: () => void;
  setHidden: (hidden: boolean) => void;
  dispose: () => void;
}

function shapeSliderRowHtml(def: ShapeSliderDef, value: number): string {
  return `
    <label class="editor-shape-row">
      <span class="editor-shape-label">${def.label}</span>
      <input type="range" data-shape-key="${def.key}" data-decimals="${def.decimals}"
        min="${def.min}" max="${def.max}" step="${def.step}" value="${value}" />
      <span class="editor-shape-value" data-shape-value="${def.key}">${Number(value).toFixed(def.decimals)}</span>
    </label>
  `;
}

export function createEditorShapePanel(
  parent: HTMLElement,
  handlers: EditorShapePanelHandlers,
  initial: MapTerrainShape,
): EditorShapePanelContext {
  const panel = document.createElement('aside');
  panel.id = 'editor-shape-panel';
  panel.className = 'editor-shape-panel';
  panel.innerHTML = `
    <h2>Shape</h2>
    <p class="editor-shape-hint">Sculpt edits the massing envelope. Dragging sliders previews ridges; release applies talus. Generate fills a full Quilez field.</p>
    ${SHAPE_SLIDERS.map((d) => shapeSliderRowHtml(d, initial[d.key])).join('')}
    <div class="editor-shape-generate">
      ${shapeSliderRowHtml(SEED_SLIDER, initial.seed)}
      <button type="button" id="btn-generate-terrain" class="editor-shape-generate-btn">
        Generate
      </button>
      <p class="editor-shape-hint editor-shape-generate-hint">
        Fills the map with a full Quilez field for this seed, then sculpt to edit.
      </p>
    </div>
  `;
  parent.appendChild(panel);

  const readShapeFromPanel = (): MapTerrainShape => {
    const shape = { ...handlers.getTerrainShape() };
    panel.querySelectorAll<HTMLInputElement>('input[data-shape-key]').forEach((input) => {
      const key = input.dataset.shapeKey as keyof MapTerrainShape;
      shape[key] = parseFloat(input.value);
    });
    return shape;
  };

  const sync = () => {
    const shape = handlers.getTerrainShape();
    for (const def of [...SHAPE_SLIDERS, SEED_SLIDER]) {
      const input = panel.querySelector<HTMLInputElement>(`input[data-shape-key="${def.key}"]`);
      const valueEl = panel.querySelector<HTMLElement>(`[data-shape-value="${def.key}"]`);
      if (!input || !valueEl) continue;
      input.value = String(shape[def.key]);
      valueEl.textContent = Number(shape[def.key]).toFixed(def.decimals);
    }
  };

  panel.querySelectorAll<HTMLInputElement>('input[data-shape-key]').forEach((input) => {
    const key = input.dataset.shapeKey as keyof MapTerrainShape;
    const decimals = Number(input.dataset.decimals ?? 2);
    const valueEl = panel.querySelector<HTMLElement>(`[data-shape-value="${key}"]`)!;

    const applyValue = () => {
      const value = parseFloat(input.value);
      valueEl.textContent = value.toFixed(decimals);
    };

    if (key === 'seed') {
      input.addEventListener('input', () => {
        applyValue();
        handlers.onTerrainSeedChange(Math.max(1, Math.floor(parseFloat(input.value)) || 1));
      });
      input.addEventListener('change', () => {
        applyValue();
        handlers.onTerrainSeedChange(Math.max(1, Math.floor(parseFloat(input.value)) || 1));
      });
      return;
    }

    input.addEventListener('input', () => {
      applyValue();
      handlers.onTerrainShapeChange(readShapeFromPanel(), 'input');
    });
    input.addEventListener('change', () => {
      applyValue();
      handlers.onTerrainShapeChange(readShapeFromPanel(), 'change');
    });
  });

  panel.querySelector('#btn-generate-terrain')!.addEventListener('click', () => {
    handlers.onGenerateTerrain();
  });

  return {
    panel,
    sync,
    setHidden: (hidden) => panel.classList.toggle('hidden', hidden),
    dispose: () => panel.remove(),
  };
}
