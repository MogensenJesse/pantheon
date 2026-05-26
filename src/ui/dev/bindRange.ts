// src/ui/dev/bindRange.ts — shared dev panel slider wiring
export function bindRange(
  panel: HTMLDivElement,
  id: string,
  outId: string,
  format: (v: number) => string,
  onInput: (v: number) => void,
): HTMLInputElement {
  const slider = panel.querySelector(`#${id}`) as HTMLInputElement;
  const output = panel.querySelector(`#${outId}`) as HTMLOutputElement;
  const sync = () => {
    const v = Number(slider.value);
    output.textContent = format(v);
    onInput(v);
  };
  slider.addEventListener('input', sync);
  return slider;
}

export function bindRangeOnChange(
  panel: HTMLDivElement,
  id: string,
  outId: string,
  format: (v: number) => string,
  onChange: (v: number) => void,
): void {
  const slider = panel.querySelector(`#${id}`) as HTMLInputElement | null;
  const output = panel.querySelector(`#${outId}`) as HTMLOutputElement | null;
  if (!slider) return;
  slider.addEventListener('input', () => {
    if (output) output.textContent = format(Number(slider.value));
  });
  slider.addEventListener('change', () => {
    const v = Number(slider.value);
    if (output) output.textContent = format(v);
    onChange(v);
  });
}

export function syncSlider(
  panel: HTMLDivElement,
  id: string,
  outId: string,
  value: number,
  format: (v: number) => string,
): void {
  const slider = panel.querySelector(`#${id}`) as HTMLInputElement | null;
  const output = panel.querySelector(`#${outId}`) as HTMLOutputElement | null;
  if (!slider) return;
  slider.value = String(value);
  if (output) output.textContent = format(value);
}
