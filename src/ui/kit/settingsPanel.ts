// src/ui/kit/settingsPanel.ts — the interface settings panel (also the first user of the panel manager)

import { button } from './button';
import { h } from './dom';
import { closePanel, isPanelOpen, openPanel } from './panels';
import {
  getUiSettings,
  resetUiSettings,
  subscribeUiSettings,
  UI_SCALE,
  type UiSettings,
  updateUiSettings,
} from './settings';

const PANEL_ID = 'settings';

const percent = (scale: number) => `${Math.round(scale * 100)}%`;

function buildContent(): { element: HTMLElement; dispose: () => void } {
  const settings = getUiSettings();

  const scaleOutput = h('output', { class: 'k-field__value', attrs: { for: 'k-set-scale' } });
  const scale = h('input', {
    class: 'k-range',
    attrs: {
      id: 'k-set-scale',
      type: 'range',
      min: UI_SCALE.min,
      max: UI_SCALE.max,
      step: UI_SCALE.step,
    },
    on: { input: () => updateUiSettings({ scale: Number(scale.value) }) },
  });
  const motion = h('input', {
    class: 'k-check',
    attrs: { id: 'k-set-motion', type: 'checkbox' },
    on: { change: () => updateUiSettings({ reduceMotion: motion.checked }) },
  });
  const contrast = h('input', {
    class: 'k-check',
    attrs: { id: 'k-set-contrast', type: 'checkbox' },
    on: { change: () => updateUiSettings({ highContrast: contrast.checked }) },
  });

  const show = (s: UiSettings) => {
    scale.value = String(s.scale);
    scaleOutput.textContent = percent(s.scale);
    motion.checked = s.reduceMotion;
    contrast.checked = s.highContrast;
  };
  show(settings);

  const field = (id: string, label: string, control: HTMLElement, hint?: string) =>
    h(
      'div',
      { class: 'k-field' },
      h('label', { class: 'k-field__label', attrs: { for: id }, text: label }),
      control,
      hint && h('p', { class: 'k-field__hint', text: hint }),
    );

  const element = h(
    'div',
    { class: 'k-form' },
    field(
      'k-set-scale',
      'Interface size',
      h('span', { class: 'k-field__control' }, scale, scaleOutput),
    ),
    field('k-set-motion', 'Reduce motion', motion, 'Fades and slides happen at once.'),
    field(
      'k-set-contrast',
      'High contrast',
      contrast,
      'Brighter text, stronger borders and more solid panels.',
    ),
    h(
      'div',
      { class: 'k-actions' },
      button('Reset to defaults', () => resetUiSettings()),
    ),
  );

  return { element, dispose: subscribeUiSettings(show) };
}

export function openSettingsPanel(): void {
  if (isPanelOpen(PANEL_ID)) return;
  const { element, dispose } = buildContent();
  openPanel({ id: PANEL_ID, title: 'Settings', content: element, onClose: dispose });
}

export function toggleSettingsPanel(): void {
  if (isPanelOpen(PANEL_ID)) closePanel(PANEL_ID);
  else openSettingsPanel();
}
