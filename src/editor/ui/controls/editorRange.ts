// src/editor/ui/controls/editorRange.ts — typed range slider binding for editor chrome

export interface EditorRangeBindOptions {
  /** Fire on every input event (live preview). Default true. */
  onInput?: (value: number) => void;
  /** Fire on change event (committed value). */
  onChange?: (value: number) => void;
  /** Invoke handlers with the initial slider value. Default true. */
  emitInitial?: boolean;
}

export function bindEditorRange(
  root: ParentNode,
  id: string,
  format: (value: number) => string,
  handlers: EditorRangeBindOptions,
): () => void {
  const slider = root.querySelector<HTMLInputElement>(`#${id}`);
  const output = root.querySelector<HTMLElement>(`#${id}-out`);
  if (!slider) return () => {};

  const syncOutput = (value: number) => {
    if (output) output.textContent = format(value);
  };

  const onInput = () => {
    const value = Number(slider.value);
    syncOutput(value);
    handlers.onInput?.(value);
  };

  const onChange = () => {
    const value = Number(slider.value);
    syncOutput(value);
    handlers.onChange?.(value);
  };

  if (handlers.onInput) slider.addEventListener('input', onInput);
  if (handlers.onChange) slider.addEventListener('change', onChange);

  if (handlers.emitInitial !== false) {
    const initial = Number(slider.value);
    syncOutput(initial);
    handlers.onInput?.(initial);
    handlers.onChange?.(initial);
  }

  return () => {
    if (handlers.onInput) slider.removeEventListener('input', onInput);
    if (handlers.onChange) slider.removeEventListener('change', onChange);
  };
}

export function syncEditorRangeValue(
  root: ParentNode,
  id: string,
  value: number,
  format: (value: number) => string,
): void {
  const slider = root.querySelector<HTMLInputElement>(`#${id}`);
  const output = root.querySelector<HTMLElement>(`#${id}-out`);
  if (!slider) return;
  slider.value = String(value);
  if (output) output.textContent = format(value);
}
