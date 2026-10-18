// src/ui/saves/slotPanel.ts — the slot lists (save and load) and a small confirm panel
//
// Both lists are kit panels. A used slot asks before it is acted on, right in its own row, so nothing
// is replaced, loaded over or deleted by one stray click. Which slots show, and their text, come from
// the pure rules in save/slotView.ts.

import type { SlotId, SlotMeta } from '../../save/slots';
import { describeSlot, loadRows, type SlotRow, saveRows } from '../../save/slotView';
import { closePanel, h, icon, openPanel, type PanelHandle } from '../kit';

export interface SlotPanelOptions {
  mode: 'load' | 'save';
  listSlots: () => Promise<readonly SlotMeta[]>;
  /**
   * Acts on the chosen slot. Resolves true to close the panel afterwards; false keeps it open;
   * 'leaving' keeps it as it is with every button disabled (the page is on its way out).
   */
  onChoose: (id: SlotId) => Promise<boolean | 'leaving'> | boolean | 'leaving';
  /** Present in load mode for manual slots: deletes after a confirmation. */
  onDelete?: (id: SlotId) => Promise<void>;
  /** Ask before acting on a used slot. Saving always asks; loading asks only when this is set. */
  confirm?: { text: string; action: string };
  now?: () => number;
}

const SAVE_CONFIRM = { text: 'Replace this save?', action: 'Replace' };
const DELETE_CONFIRM = { text: 'Delete this save for good?', action: 'Delete' };

export function openSlotPanel(o: SlotPanelOptions): PanelHandle {
  const panelId = `slots-${o.mode}`;
  const now = o.now ?? Date.now;
  const confirm = o.mode === 'save' ? SAVE_CONFIRM : o.confirm;
  const body = h('div', { class: 'sv-slots' }, h('p', { class: 'sv-text', text: 'Looking…' }));

  let rows: SlotRow[] = [];
  let armed: { id: SlotId; kind: 'choose' | 'delete' } | null = null;
  let busy = false;
  let error = '';

  const render = () => {
    const children: HTMLElement[] = rows.map(rowElement);
    if (error) children.push(h('p', { class: 'sv-error', text: error, attrs: { role: 'alert' } }));
    body.replaceChildren(...children);
  };

  const run = async (work: () => Promise<boolean | 'leaving'> | boolean | 'leaving') => {
    busy = true;
    error = '';
    armed = null;
    render();
    let close: boolean | 'leaving' = true;
    try {
      close = await work();
    } catch (err) {
      error = err instanceof Error ? err.message : 'That did not work.';
      close = false;
    }
    if (close === 'leaving') return;
    busy = false;
    if (close) closePanel(panelId);
    else render();
  };

  const refresh = async () => {
    const metas = await o.listSlots();
    rows = o.mode === 'save' ? saveRows(metas) : loadRows(metas);
    render();
  };

  const confirmRow = (text: string, action: string, go: () => void): HTMLElement =>
    h(
      'div',
      { class: 'sv-confirm', attrs: { role: 'group', 'aria-label': text } },
      h('span', { text }),
      h(
        'span',
        { class: 'k-actions' },
        h('button', {
          class: 'k-button',
          text: action,
          attrs: { type: 'button' },
          on: { click: go },
        }),
        h('button', {
          class: 'k-button',
          text: 'Cancel',
          attrs: { type: 'button' },
          on: {
            click: () => {
              armed = null;
              render();
            },
          },
        }),
      ),
    );

  function rowElement(row: SlotRow): HTMLElement {
    const used = row.meta !== null;
    const canChoose = o.mode === 'save' || used;
    const lines = row.meta ? describeSlot(row.meta, now()) : null;
    const main = h(
      'button',
      {
        class: `sv-slot${used ? '' : ' sv-slot--empty'}`,
        attrs: { type: 'button', disabled: busy || !canChoose },
        on: {
          click: () => {
            if (used && confirm) {
              armed = { id: row.id, kind: 'choose' };
              render();
            } else void run(() => o.onChoose(row.id));
          },
        },
      },
      h('span', { class: 'sv-slot__name', text: row.label }),
      lines
        ? h('span', { class: 'sv-slot__line', text: lines.title })
        : h('span', { class: 'sv-slot__line sv-slot__line--quiet', text: 'Empty' }),
      lines && h('span', { class: 'sv-slot__line sv-slot__line--quiet', text: lines.detail }),
    );
    const canDelete = o.mode === 'load' && o.onDelete && used && row.id.startsWith('manual');
    const wrapper = h(
      'div',
      { class: 'sv-slot-row' },
      main,
      canDelete
        ? h(
            'button',
            {
              class: 'k-icon-button',
              attrs: { type: 'button', 'aria-label': `Delete ${row.label}`, disabled: busy },
              on: {
                click: () => {
                  armed = { id: row.id, kind: 'delete' };
                  render();
                },
              },
            },
            icon('close'),
          )
        : null,
    );
    if (armed?.id === row.id && armed.kind === 'choose' && confirm) {
      wrapper.appendChild(
        confirmRow(confirm.text, confirm.action, () => void run(() => o.onChoose(row.id))),
      );
    } else if (armed?.id === row.id && armed.kind === 'delete' && o.onDelete) {
      const del = o.onDelete;
      wrapper.appendChild(
        confirmRow(
          DELETE_CONFIRM.text,
          DELETE_CONFIRM.action,
          () =>
            void run(async () => {
              await del(row.id);
              await refresh();
              return false;
            }),
        ),
      );
    }
    return wrapper;
  }

  const handle = openPanel({
    id: panelId,
    title: o.mode === 'save' ? 'Save game' : 'Load game',
    content: body,
  });
  refresh().catch((err) => {
    error = err instanceof Error ? err.message : 'Could not read the saved games.';
    rows = [];
    render();
  });
  return handle;
}

export interface ConfirmPanelOptions {
  id: string;
  title: string;
  text: string;
  action: string;
  onConfirm: () => void;
}

/** A question with two answers, as a kit panel. */
export function openConfirmPanel(o: ConfirmPanelOptions): PanelHandle {
  const content = h(
    'div',
    null,
    h('p', { class: 'sv-text', text: o.text }),
    h(
      'div',
      { class: 'k-actions' },
      h('button', {
        class: 'k-button',
        text: 'Cancel',
        attrs: { type: 'button' },
        on: { click: () => closePanel(o.id) },
      }),
      h('button', {
        class: 'k-button',
        text: o.action,
        attrs: { type: 'button' },
        on: {
          click: () => {
            closePanel(o.id);
            o.onConfirm();
          },
        },
      }),
    ),
  );
  return openPanel({ id: o.id, title: o.title, content });
}
