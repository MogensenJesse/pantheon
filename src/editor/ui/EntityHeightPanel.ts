// src/editor/ui/EntityHeightPanel.ts — height of the selected props and landmarks, with a reset to ground level

import type { EditorWorkspaceStore } from '../core/EditorWorkspaceStore';
import type { EntityHeightReading } from '../place/entityHeight';

export interface EntityHeightPanelHandlers {
  read: () => EntityHeightReading;
  /** A new value while typing or stepping; the session opens one undo step for the whole burst. */
  onInput: (liftM: number) => void;
  /** The field was committed (Enter, blur, a stepper click): closes that undo step. */
  onCommit: () => void;
  /** Back to ground level, as one undo step. */
  onReset: () => void;
}

export interface EntityHeightPanelContext {
  /** Re-read the selection (it changed without the store noticing, or an undo moved the heights). */
  refresh: () => void;
  dispose: () => void;
}

export function createEntityHeightPanel(
  host: HTMLElement,
  store: EditorWorkspaceStore,
  handlers: EntityHeightPanelHandlers,
): EntityHeightPanelContext {
  const root = document.createElement('div');
  root.hidden = true;
  root.innerHTML = `
    <label class="editor-range editor-height-row" title="Metres over the ground. 0 = resting on the terrain.">
      <span>Height (m)</span>
      <input type="number" id="entity-height" step="0.1" />
    </label>
    <button type="button" id="entity-height-reset" class="editor-secondary-btn">Reset height</button>
  `;
  host.appendChild(root);

  const input = root.querySelector<HTMLInputElement>('#entity-height')!;
  const reset = root.querySelector<HTMLButtonElement>('#entity-height-reset')!;

  const refresh = () => {
    const { count, liftM } = handlers.read();
    root.hidden = store.get().tool !== 'place' || count === 0;
    reset.disabled = liftM === 0;
    if (root.hidden || document.activeElement === input) return; // never rewrite what is being typed
    input.value = liftM === null ? '' : String(Math.round(liftM * 100) / 100);
    input.placeholder = liftM === null ? 'mixed' : '';
  };

  const onInput = () => {
    const v = Number(input.value);
    if (input.value === '' || !Number.isFinite(v)) return;
    handlers.onInput(v);
    refresh();
  };
  const onChange = () => {
    handlers.onCommit();
    refresh();
  };
  const onReset = () => {
    handlers.onReset();
    refresh();
  };
  input.addEventListener('input', onInput);
  input.addEventListener('change', onChange);
  reset.addEventListener('click', onReset);

  const unsubStore = store.subscribe(refresh);

  return {
    refresh,
    dispose: () => {
      unsubStore();
      input.removeEventListener('input', onInput);
      input.removeEventListener('change', onChange);
      reset.removeEventListener('click', onReset);
      root.remove();
    },
  };
}
