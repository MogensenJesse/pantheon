// src/dev/bindRange.ts — shared dev panel section/slider/checkbox helpers
export interface SectionSpec {
  /** Container id in DevPanelLayout shell (e.g. `dev-section-gameplay`). */
  hostId: string;
  /** `<summary>` text. */
  title: string;
  /** Default open state — top-level IA panels (Gameplay, Debug) use `true`; nested sections use `false`. */
  open: boolean;
  /** Inner `.dev-section-body` markup. */
  body: string;
}

/**
 * Mount a `<details class="dev-section">` block inside the matching
 * `#${hostId}` container. Returns the inserted body element so caller can
 * query/bind controls.
 */
export function mountSection(panel: HTMLDivElement, spec: SectionSpec): HTMLElement | null {
  const host = panel.querySelector(`#${spec.hostId}`);
  if (!host) return null;
  const details = document.createElement('details');
  details.className = 'dev-section';
  if (spec.open) details.setAttribute('open', '');
  details.innerHTML = `
    <summary>${spec.title}</summary>
    <div class="dev-section-body">${spec.body}</div>
  `;
  host.replaceWith(details);
  details.id = spec.hostId;
  return details.querySelector('.dev-section-body');
}

export interface RangeSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format: (v: number) => string;
}

/** Render a `<label class="dev-row">` row for one RangeSpec (slider + output). */
export function rangeRowHtml(s: RangeSpec): string {
  return `
    <label class="dev-row">
      <span>${s.label}</span>
      <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
      <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
    </label>`;
}

/** Inject a contiguous block of range-row markup into `host` (replaces existing content). */
export function injectRangeRows(host: Element, specs: readonly RangeSpec[]): void {
  host.innerHTML = specs.map(rangeRowHtml).join('');
}

/**
 * Force every slider in `specs` back to a freshly-read value.
 * Useful after a reset where the underlying defaults may have shifted (e.g. cloud rings).
 */
export function syncSpecs<T extends RangeSpec>(
  panel: HTMLDivElement,
  specs: readonly T[],
  read: (s: T) => number,
): void {
  for (const s of specs) {
    const value = read(s);
    syncSlider(panel, s.id, `${s.id}-out`, value, s.format);
  }
}

export function bindRange(
  panel: HTMLDivElement,
  id: string,
  outId: string,
  format: (v: number) => string,
  onInput: (v: number) => void,
): () => void {
  const slider = panel.querySelector(`#${id}`) as HTMLInputElement | null;
  const output = panel.querySelector(`#${outId}`) as HTMLOutputElement | null;
  if (!slider) return () => {};
  const sync = () => {
    const v = Number(slider.value);
    if (output) output.textContent = format(v);
    onInput(v);
  };
  slider.addEventListener('input', sync);
  return () => slider.removeEventListener('input', sync);
}

export function bindRangeOnChange(
  panel: HTMLDivElement,
  id: string,
  outId: string,
  format: (v: number) => string,
  onChange: (v: number) => void,
): () => void {
  const slider = panel.querySelector(`#${id}`) as HTMLInputElement | null;
  const output = panel.querySelector(`#${outId}`) as HTMLOutputElement | null;
  if (!slider) return () => {};
  const onInputSync = () => {
    if (output) output.textContent = format(Number(slider.value));
  };
  const onChangeSync = () => {
    const v = Number(slider.value);
    if (output) output.textContent = format(v);
    onChange(v);
  };
  slider.addEventListener('input', onInputSync);
  slider.addEventListener('change', onChangeSync);
  return () => {
    slider.removeEventListener('input', onInputSync);
    slider.removeEventListener('change', onChangeSync);
  };
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

/**
 * Bind a checkbox to a getter/setter pair. The checkbox is initialised from `get()`,
 * and every `change` event calls `set(checked)`. Returns a cleanup that removes the listener.
 */
export function bindCheckbox(
  panel: HTMLDivElement,
  id: string,
  get: () => boolean,
  set: (v: boolean) => void,
): () => void {
  const el = panel.querySelector(`#${id}`) as HTMLInputElement | null;
  if (!el) return () => {};
  el.checked = get();
  const onChange = () => set(el.checked);
  el.addEventListener('change', onChange);
  return () => el.removeEventListener('change', onChange);
}
