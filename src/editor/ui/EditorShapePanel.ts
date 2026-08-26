// src/editor/ui/EditorShapePanel.ts — ridge-brush Quilez params (used only on new strokes)
import type { MapTerrainShape } from '../../map/MapTypes';

type ShapeSliderDef = {
  key: keyof MapTerrainShape;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
};

const RIDGE_SLIDERS: ShapeSliderDef[] = [
  { key: 'frequency', label: 'Frequency', min: 0.002, max: 0.02, step: 0.0005, decimals: 4 },
  { key: 'octaves', label: 'Octaves', min: 1, max: 8, step: 1, decimals: 0 },
  { key: 'erosion', label: 'Erosion', min: 0, max: 1.5, step: 0.05, decimals: 2 },
  { key: 'warp', label: 'Warp', min: 0, max: 1, step: 0.05, decimals: 2 },
  { key: 'valleyBias', label: 'Valley bias', min: 1, max: 3, step: 0.1, decimals: 1 },
  { key: 'seed', label: 'Seed', min: 1, max: 100, step: 1, decimals: 0 },
];

export interface EditorShapePanelHandlers {
  getTerrainShape: () => MapTerrainShape;
  onTerrainShapeChange: (shape: MapTerrainShape) => void;
}

export interface EditorShapePanelContext {
  panel: HTMLElement;
  sync: () => void;
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
  const panel = document.createElement('div');
  panel.id = 'editor-shape-panel';
  panel.className = 'editor-shape-fields editor-ridge-params';
  panel.innerHTML = RIDGE_SLIDERS.map((d) => shapeSliderRowHtml(d, initial[d.key])).join('');
  parent.appendChild(panel);

  const readShapeFromPanel = (): MapTerrainShape => {
    const shape = { ...handlers.getTerrainShape() };
    panel.querySelectorAll<HTMLInputElement>('input[data-shape-key]').forEach((input) => {
      const key = input.dataset.shapeKey as keyof MapTerrainShape;
      const value = parseFloat(input.value);
      shape[key] =
        key === 'seed' || key === 'octaves' ? Math.max(1, Math.floor(value) || 1) : value;
    });
    return shape;
  };

  const sync = () => {
    const shape = handlers.getTerrainShape();
    for (const def of RIDGE_SLIDERS) {
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
      handlers.onTerrainShapeChange(readShapeFromPanel());
    };

    input.addEventListener('input', applyValue);
    input.addEventListener('change', applyValue);
  });

  return {
    panel,
    sync,
    dispose: () => panel.remove(),
  };
}
