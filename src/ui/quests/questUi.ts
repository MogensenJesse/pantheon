// src/ui/quests/questUi.ts — how the conversion quest reaches the player
//
// One quiet objective line at the top left ("Help 5 villagers believe  2 / 5") and a journal on `J`:
// the steps done and the current one, then the memory fragments found. The journal is a modal panel
// that freezes the world, like the skill tree.

import { bus } from '../../core/EventBus';
import { state } from '../../core/state/gameState';
import { memoryFragmentText } from '../../quests/fragments';
import type { JournalRow, Objective } from '../../quests/quest';
import {
  closePanel,
  getLayer,
  h,
  isPanelOpen,
  onPanelsChanged,
  openPanel,
  registerHotkey,
} from '../kit';
import './quests.css';

export interface QuestUiDeps {
  objective: () => Objective | null;
  journal: () => JournalRow[];
  setPaused: (paused: boolean) => void;
}

export const JOURNAL_PANEL_ID = 'journal';

const objectiveText = (o: Objective) =>
  o.goal !== undefined ? `${o.text}  ${o.value ?? 0} / ${o.goal}` : o.text;

export function openJournal(deps: QuestUiDeps) {
  const rows = deps.journal();
  const steps = h(
    'ol',
    { class: 'qj-steps' },
    ...rows.map((row) =>
      h('li', {
        class: `qj-step is-${row.status}`,
        text:
          row.goal !== undefined && row.status === 'current'
            ? `${row.text}  ${row.value ?? 0} / ${row.goal}`
            : row.text,
      }),
    ),
  );
  const fragments = [...state.memoryFragments]
    .sort((a, b) => a - b)
    .flatMap((id) => {
      const text = memoryFragmentText(id);
      return text ? [h('p', { class: 'qj-fragment', text })] : [];
    });
  const content = h(
    'div',
    { class: 'qj-body' },
    rows.length ? steps : h('p', { class: 'qj-empty', text: 'Nothing is asked of you yet.' }),
    fragments.length ? h('h3', { class: 'qj-head', text: 'Memories' }) : '',
    ...fragments,
  );
  deps.setPaused(true);
  return openPanel({
    id: JOURNAL_PANEL_ID,
    title: 'Journal',
    content,
    onClose: () => deps.setPaused(false),
  });
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
  const offChanged = bus.on('quest:changed', render);
  const offPanels = onPanelsChanged(render);
  const offKey = registerHotkey(
    'KeyJ',
    () => {
      if (isPanelOpen()) return;
      openJournal(deps);
    },
    'Journal',
  );
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
