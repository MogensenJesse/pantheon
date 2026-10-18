// src/ui/kit/confirmPanel.ts — a question with two answers, as a kit panel

import { button } from './button';
import { h } from './dom';
import { closePanel, openPanel, type PanelHandle } from './panels';

interface ConfirmPanelOptions {
  id: string;
  title: string;
  text: string;
  /** The label of the button that goes ahead. */
  action: string;
  onConfirm: () => void;
}

export function openConfirmPanel(o: ConfirmPanelOptions): PanelHandle {
  const content = h(
    'div',
    null,
    h('p', { class: 'k-text', text: o.text }),
    h(
      'div',
      { class: 'k-actions' },
      button('Cancel', () => closePanel(o.id)),
      button(o.action, () => {
        closePanel(o.id);
        o.onConfirm();
      }),
    ),
  );
  return openPanel({ id: o.id, title: o.title, content });
}
