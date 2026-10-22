// src/ui/quests/questUi.ts — how the quests reach the player
//
// One quiet objective line at the top left ("Help 5 villagers believe  2 / 5") for the conversion quest and
// the restoration of the places, and the journal on `J`: the memory book (the rune, the memories found,
// the places woken and the milestones reached), with no to-do list. The journal is a modal panel that
// freezes the world, like the skill tree.

import { bus } from '../../core/EventBus';
import type { MemoryBook } from '../../quests/memoryBook';
import type { Objective } from '../../quests/quest';
import {
  closePanel,
  getLayer,
  h,
  isPanelOpen,
  onPanelsChanged,
  openPanel,
  registerHotkey,
} from '../kit';
import { runeSvg } from './runeView';

export interface QuestUiDeps {
  objective: () => Objective | null;
  book: () => MemoryBook;
}

export const JOURNAL_PANEL_ID = 'journal';

const objectiveText = (o: Objective) =>
  o.goal !== undefined ? `${o.text}  ${o.value ?? 0} / ${o.goal}` : o.text;

const STATUS_WORDS = { awake: 'Awake', restoring: 'Being restored', restored: 'Restored' } as const;

export function openJournal(deps: QuestUiDeps) {
  const book = deps.book();
  const places = book.places.map((place) =>
    h(
      'div',
      { class: `qj-place is-${place.status}` },
      h('p', { class: 'qj-caption', text: place.caption }),
      place.restoredCaption
        ? h('p', { class: 'qj-caption', text: place.restoredCaption })
        : h('p', { class: 'qj-status', text: STATUS_WORDS[place.status] }),
      place.effect ? h('p', { class: 'qj-status', text: place.effect }) : '',
    ),
  );
  const content = h(
    'div',
    { class: 'qj-body' },
    runeSvg(book.rune),
    book.memories.length || places.length || book.milestones.length
      ? ''
      : h('p', { class: 'qj-empty', text: 'The book is empty. Nothing is remembered yet.' }),
    book.memories.length ? h('h3', { class: 'qj-head', text: 'Memories' }) : '',
    ...book.memories.map((m) => h('p', { class: 'qj-fragment', text: m.text })),
    places.length ? h('h3', { class: 'qj-head', text: 'Places' }) : '',
    ...places,
    book.milestones.length ? h('h3', { class: 'qj-head', text: 'The village' }) : '',
    book.milestones.length
      ? h(
          'ul',
          { class: 'qj-milestones' },
          ...book.milestones.map((label) => h('li', { text: label })),
        )
      : '',
  );
  return openPanel({ id: JOURNAL_PANEL_ID, title: 'Memory book', content, pausesWorld: true });
}

export function initQuestUi(deps: QuestUiDeps): () => void {
  const line = h('p', { class: 'q-objective', attrs: { 'aria-live': 'polite', hidden: true } });
  let shown = '';
  const render = () => {
    const o = deps.objective();
    line.hidden = !o || isPanelOpen();
    // Only write when the words change: the line is a live region and would be read out again.
    const next = o ? objectiveText(o) : '';
    if (next !== shown) {
      shown = next;
      line.textContent = next;
    }
  };
  // The objective changes with the quest; the line hides while a panel is open.
  const offChanged = bus.on('objective:changed', render);
  const offPanels = onPanelsChanged(render);
  const offKey = registerHotkey('KeyJ', () => openJournal(deps), 'Journal', {
    whenPanelOpen: false,
  });
  getLayer('hud').appendChild(line);
  render();
  return () => {
    offPanels();
    offChanged();
    offKey();
    closePanel(JOURNAL_PANEL_ID);
    line.remove();
  };
}
