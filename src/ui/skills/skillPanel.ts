// src/ui/skills/skillPanel.ts — the skill tree: a constellation you can pan and zoom
//
// A modal kit panel that pauses the world, like the pause menu. What each node looks like and says comes
// from the pure skills/skillView.ts; the drawing is in constellation.ts and the pan and zoom in
// panZoomViewport.ts. The panel keeps itself up to date from `skills:changed`.

import { bus } from '../../core/EventBus';
import {
  SKILL_NODES,
  type SkillNode,
  type SkillsState,
  type UnlockCheck,
} from '../../skills/skillTree';
import { type Bounds, sparksLabel, treeBounds, unlockRefusalText } from '../../skills/skillView';
import { button, h, icon, notify, openConfirmPanel, openPanel, type PanelHandle } from '../kit';
import { createConstellation } from './constellation';
import { createPanZoomViewport } from './panZoomViewport';

export interface SkillPanelDeps {
  state: () => SkillsState;
  unlock: (id: string) => UnlockCheck;
  respec: () => void;
}

export const SKILL_PANEL_ID = 'skills';

const ZOOM_STEP = 1.25;

export function openSkillPanel(
  deps: SkillPanelDeps,
  tree: readonly SkillNode[] = SKILL_NODES,
): PanelHandle {
  const bounds: Bounds = treeBounds(tree);
  const viewport = createPanZoomViewport(bounds, 'Skill constellation');
  const constellation = createConstellation(tree, viewport.world, {
    state: deps.state,
    onTake: (node) => {
      const result = deps.unlock(node.id);
      if (!result.ok) {
        notify({ text: unlockRefusalText(result.reason), kind: 'info', key: 'skill-refusal' });
      }
    },
  });

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

  const refresh = () => {
    const state = deps.state();
    sparksEl.replaceChildren(icon('spark'), ` ${sparksLabel(state.sparks)}`);
    constellation.refresh(state);
    respecButton.disabled = Object.keys(state.ranks).length === 0;
  };

  const content = h(
    'div',
    { class: 'sk-body' },
    h(
      'div',
      { class: 'sk-top' },
      sparksEl,
      h(
        'span',
        { class: 'sk-tools' },
        tool('Zoom out', '−', () => viewport.zoomBy(1 / ZOOM_STEP)),
        tool('Zoom in', '+', () => viewport.zoomBy(ZOOM_STEP)),
        tool('Centre the tree', 'Centre', viewport.reset),
        respecButton,
      ),
    ),
    viewport.element,
    h('p', {
      class: 'sk-hint',
      text: 'Drag to move, scroll to zoom. Hold Shift on a skill for details.',
    }),
  );

  const offChanged = bus.on('skills:changed', refresh);
  const handle = openPanel({
    id: SKILL_PANEL_ID,
    title: 'The Void',
    content,
    pausesWorld: true,
    onClose: () => {
      offChanged();
      constellation.dispose();
    },
  });
  refresh();
  // The viewport has its size only once the panel is in the page.
  requestAnimationFrame(viewport.reset);
  return handle;
}
