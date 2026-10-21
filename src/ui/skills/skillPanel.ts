// src/ui/skills/skillPanel.ts — the skill tree: a constellation you can pan and zoom
//
// A modal kit panel that pauses the world, like the pause menu. What each node looks like and says comes
// from the pure skills/skillView.ts; the drawing is in constellation.ts and the pan and zoom in
// panZoomViewport.ts. The panel keeps itself up to date from `skills:changed`.

import { VILLAGE } from '../../config/village';
import { bus } from '../../core/EventBus';
import {
  type Arch,
  nodesOfArch,
  SKILL_NODES,
  type SkillNode,
  type SkillsState,
  type UnlockCheck,
} from '../../skills/skillTree';
import { sparksLabel, treeBounds, unlockRefusalText } from '../../skills/skillView';
import { button, h, icon, notify, openConfirmPanel, openPanel, type PanelHandle } from '../kit';
import { type Constellation, createConstellation } from './constellation';
import { createPanZoomViewport, type PanZoomViewport } from './panZoomViewport';

export interface SkillPanelDeps {
  state: () => SkillsState;
  unlock: (id: string) => UnlockCheck;
  respec: () => void;
}

export const SKILL_PANEL_ID = 'skills';

const ZOOM_STEP = 1.25;

const ARCH_TITLE: Record<Arch, string> = { void: 'The Void', village: 'The Village' };

/** Opens the panel on one arch of the tree: The Void, or (once it has opened) The Village. */
export function openSkillPanel(
  deps: SkillPanelDeps,
  initialArch: Arch = 'void',
  allNodes: readonly SkillNode[] = SKILL_NODES,
): PanelHandle {
  let arch = initialArch;
  let viewport: PanZoomViewport;
  let constellation: Constellation;
  let frame = 0;

  /** The viewport and the constellation of the current arch, built fresh when the arch changes. */
  const build = () => {
    const tree = nodesOfArch(arch, allNodes);
    viewport = createPanZoomViewport(treeBounds(tree), 'Skill constellation');
    constellation = createConstellation(tree, viewport.world, {
      state: deps.state,
      onTake: (node) => {
        const result = deps.unlock(node.id);
        if (!result.ok) {
          notify({ text: unlockRefusalText(result.reason), kind: 'info', key: 'skill-refusal' });
        }
      },
    });
  };
  build();

  const sparksEl = h('span', { class: 'sk-sparks', attrs: { 'aria-live': 'polite' } });
  const tool = (label: string, text: string, onClick: () => void) =>
    button(text, onClick, { class: 'sk-tool', ariaLabel: label });
  const respecButton = button(
    'Respec',
    () =>
      openConfirmPanel({
        id: 'respec',
        title: 'Respec',
        text: 'Take back every skill and get all your sparks back?',
        action: 'Respec',
        onConfirm: () => deps.respec(),
      }),
    { class: 'sk-tool' },
  );

  // The two arches: The Village stays shut until the converted village has earned its faith.
  const archTab = (to: Arch) => {
    const tab = button(ARCH_TITLE[to], () => switchTo(to), {
      class: 'sk-tool sk-tab',
      ariaLabel: `Show ${ARCH_TITLE[to]}`,
    });
    tab.setAttribute('role', 'tab');
    return tab;
  };
  const voidTab = archTab('void');
  const villageTab = archTab('village');
  const markTabs = () => {
    for (const [tab, to] of [
      [voidTab, 'void'],
      [villageTab, 'village'],
    ] as const) {
      tab.classList.toggle('is-active', to === arch);
      tab.setAttribute('aria-selected', String(to === arch));
    }
  };
  markTabs();

  const refresh = () => {
    const state = deps.state();
    sparksEl.replaceChildren(icon('spark'), ` ${sparksLabel(state.sparks)}`);
    constellation.refresh(state);
    respecButton.disabled = Object.keys(state.ranks).length === 0;
    villageTab.disabled = !state.villageOpened;
    villageTab.title = state.villageOpened
      ? ''
      : `Opens when the converted village has earned ${VILLAGE.ARCH_II.OPEN_FAITH_EARNED} faith`;
  };

  const hint = h('p', {
    class: 'sk-hint',
    text: 'Drag to move, scroll to zoom. Hold Shift on a skill for details.',
  });
  const content = h(
    'div',
    { class: 'sk-body' },
    h(
      'div',
      { class: 'sk-top' },
      sparksEl,
      h(
        'span',
        { class: 'sk-tools', attrs: { role: 'tablist', 'aria-label': 'Arch of the tree' } },
        voidTab,
        villageTab,
      ),
      h(
        'span',
        { class: 'sk-tools' },
        tool('Zoom out', '−', () => viewport.zoomBy(1 / ZOOM_STEP)),
        tool('Zoom in', '+', () => viewport.zoomBy(ZOOM_STEP)),
        tool('Centre the tree', 'Centre', () => viewport.reset()),
        respecButton,
      ),
    ),
    viewport!.element,
    hint,
  );

  const offChanged = bus.on('skills:changed', refresh);
  const handle = openPanel({
    id: SKILL_PANEL_ID,
    title: ARCH_TITLE[arch],
    content,
    pausesWorld: true,
    onClose: () => {
      cancelAnimationFrame(frame);
      offChanged();
      constellation.dispose();
    },
  });

  /** Shows the other arch inside the same panel: the world stays paused and focus stays on the tab. */
  const switchTo = (to: Arch) => {
    if (to === arch) return;
    arch = to;
    const old = viewport.element;
    constellation.dispose();
    build();
    old.replaceWith(viewport.element);
    const title = handle.element.querySelector('.k-panel__title');
    if (title) title.textContent = ARCH_TITLE[arch];
    markTabs();
    refresh();
    frame = requestAnimationFrame(() => viewport.reset());
  };

  refresh();
  // The viewport has its size only once the panel is in the page.
  frame = requestAnimationFrame(() => viewport.reset());
  return handle;
}
