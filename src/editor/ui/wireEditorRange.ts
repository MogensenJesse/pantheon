// src/editor/ui/wireEditorRange.ts — range slider + output binding for editor chrome

import { bindRange, syncSlider } from '../../dev/bindRange';
import { asRangePanel } from './editorText';

export function wireEditorRange(
  root: HTMLElement,
  id: string,
  format: (v: number) => string,
  onInput: (v: number) => void,
  unbind: (() => void)[],
): void {
  const panel = asRangePanel(root);
  const slider = panel.querySelector(`#${id}`) as HTMLInputElement | null;
  if (!slider) return;
  const outId = `${id}-out`;
  const value = Number(slider.value);
  syncSlider(panel, id, outId, value, format);
  onInput(value);
  unbind.push(bindRange(panel, id, outId, format, onInput));
}

export function syncEditorRange(
  root: HTMLElement,
  id: string,
  value: number,
  format: (v: number) => string,
): void {
  const slider = root.querySelector<HTMLInputElement>(`#${id}`);
  const out = root.querySelector<HTMLElement>(`#${id}-out`);
  if (!slider) return;
  slider.value = String(value);
  if (out) out.textContent = format(value);
}
