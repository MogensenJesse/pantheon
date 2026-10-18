// src/ui/skills/skillPanel.ts — the skill tree: a constellation you can pan and zoom
//
// A modal kit panel, so opening it frees the mouse and stops roam input; the world is frozen while it
// is open, like the pause menu. What each node looks like and says comes from the pure
// skills/skillView.ts. Nodes are real buttons in a transformed layer (Tab walks them, Enter takes
// one); the lines between them are one SVG underneath.

import {
  SKILL_NODES,
  type SkillNode,
  type SkillsState,
  type UnlockCheck,
} from '../../skills/skillTree';
import {
  type Bounds,
  clampPan,
  fitView,
  NODE_SPACING_PX,
  nodeStatus,
  nodeTooltip,
  sparksLabel,
  treeBounds,
  treeEdges,
  unlockRefusalText,
  type View,
  zoomAt,
} from '../../skills/skillView';
import { attachTooltip, h, icon, notify, openPanel, type PanelHandle } from '../kit';
import { openConfirmPanel } from '../saves';

export interface SkillPanelDeps {
  state: () => SkillsState;
  unlock: (id: string) => UnlockCheck;
  respec: () => void;
  /** Freeze or release the world. */
  setPaused: (paused: boolean) => void;
  /** Calls back when sparks or ranks change; returns the unsubscribe. */
  onChange: (listener: () => void) => () => void;
}

export const SKILL_PANEL_ID = 'skills';

const ZOOM_STEP = 1.25;
const WHEEL_ZOOM = 1.0015;
/** A press that moves less than this (px) is a click, not a drag. */
const DRAG_SLOP_PX = 4;

export function openSkillPanel(
  deps: SkillPanelDeps,
  tree: readonly SkillNode[] = SKILL_NODES,
): PanelHandle {
  const bounds: Bounds = treeBounds(tree);
  const nodeEls = new Map<string, HTMLButtonElement>();
  const detach: (() => void)[] = [];
  let view: View = { x: 0, y: 0, scale: 1 };

  const sparksEl = h('span', { class: 'sk-sparks', attrs: { 'aria-live': 'polite' } });
  const world = h('div', { class: 'sk-world' });
  const viewport = h(
    'div',
    { class: 'sk-viewport', attrs: { 'aria-label': 'Skill constellation' } },
    world,
  );

  const viewportSize = () => ({
    width: viewport.clientWidth || 640,
    height: viewport.clientHeight || 360,
  });
  const applyView = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  };
  const setView = (next: View) => {
    view = clampPan(next, bounds, viewportSize());
    applyView();
  };
  const reset = () => setView(fitView(bounds, viewportSize()));

  // --- the lines between nodes ---
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const edges = document.createElementNS(SVG_NS, 'svg');
  edges.setAttribute('class', 'sk-edges');
  const edgeEls: { el: SVGLineElement; from: string; to: string }[] = [];
  for (const edge of treeEdges(tree)) {
    const a = tree.find((n) => n.id === edge.from);
    const b = tree.find((n) => n.id === edge.to);
    if (!a || !b) continue;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(a.x * NODE_SPACING_PX));
    line.setAttribute('y1', String(a.y * NODE_SPACING_PX));
    line.setAttribute('x2', String(b.x * NODE_SPACING_PX));
    line.setAttribute('y2', String(b.y * NODE_SPACING_PX));
    edges.appendChild(line);
    edgeEls.push({ el: line, from: edge.from, to: edge.to });
  }
  world.appendChild(edges);

  // --- the nodes ---
  const take = (node: SkillNode) => {
    const result = deps.unlock(node.id);
    if (!result.ok)
      notify({ text: unlockRefusalText(result.reason), kind: 'info', key: 'skill-refusal' });
  };
  for (const node of tree) {
    const button = h(
      'button',
      {
        class: 'sk-node',
        attrs: { type: 'button', 'data-node': node.id },
        style: { left: `${node.x * NODE_SPACING_PX}px`, top: `${node.y * NODE_SPACING_PX}px` },
        on: { click: () => take(node) },
      },
      h('span', { class: 'sk-node__gem' }, icon('spark', { size: '1.1em' })),
      h('span', { class: 'sk-node__name', text: node.name }),
    );
    detach.push(
      attachTooltip(button, () => {
        const t = nodeTooltip(deps.state(), node, tree);
        return { title: t.title, body: t.body, inspect: t.inspect };
      }),
    );
    nodeEls.set(node.id, button);
    world.appendChild(button);
  }

  const refresh = () => {
    const state = deps.state();
    sparksEl.replaceChildren(icon('spark'), ` ${sparksLabel(state.sparks)}`);
    for (const node of tree) {
      const el = nodeEls.get(node.id);
      if (!el) continue;
      const status = nodeStatus(state, node, tree);
      el.dataset.status = status;
      el.setAttribute(
        'aria-label',
        `${node.name}, ${nodeTooltip(state, node, tree).body.replace('\n', ', ')}`,
      );
      el.setAttribute('aria-disabled', String(status === 'locked' || status === 'short'));
    }
    for (const e of edgeEls) {
      const open =
        nodeStatus(state, tree.find((n) => n.id === e.from) as SkillNode, tree) === 'taken';
      e.el.classList.toggle('is-lit', open);
    }
    respecButton.disabled = Object.keys(state.ranks).length === 0;
  };

  // --- pan and zoom ---
  let drag: {
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null = null;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y, moved: false };
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add('is-dragging');
    }
    setView({ ...view, x: drag.originX + dx, y: drag.originY + dy });
  });
  const endDrag = (e: PointerEvent) => {
    if (drag?.moved && viewport.hasPointerCapture(e.pointerId))
      viewport.releasePointerCapture(e.pointerId);
    // A drag that ends on a node must not also take it.
    const wasDrag = drag?.moved;
    drag = null;
    viewport.classList.remove('is-dragging');
    if (wasDrag)
      viewport.addEventListener('click', (ev) => ev.stopPropagation(), {
        capture: true,
        once: true,
      });
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      setView(
        zoomAt(view, WHEEL_ZOOM ** -e.deltaY, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        }),
      );
    },
    { passive: false },
  );
  const zoomBy = (factor: number) => {
    const { width, height } = viewportSize();
    setView(zoomAt(view, factor, { x: width / 2, y: height / 2 }));
  };

  const iconButton = (label: string, text: string, onClick: () => void) =>
    h('button', {
      class: 'k-button sk-tool',
      text,
      attrs: { type: 'button', 'aria-label': label },
      on: { click: onClick },
    });
  const respecButton = h('button', {
    class: 'k-button sk-tool',
    text: 'Respec',
    attrs: { type: 'button' },
    on: {
      click: () =>
        openConfirmPanel({
          id: 'respec',
          title: 'Respec',
          text: 'Take back every skill and get all your sparks back?',
          action: 'Respec',
          onConfirm: () => deps.respec(),
        }),
    },
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
        { class: 'sk-tools' },
        iconButton('Zoom out', '−', () => zoomBy(1 / ZOOM_STEP)),
        iconButton('Zoom in', '+', () => zoomBy(ZOOM_STEP)),
        iconButton('Centre the tree', 'Centre', reset),
        respecButton,
      ),
    ),
    viewport,
    h('p', {
      class: 'sk-hint',
      text: 'Drag to move, scroll to zoom. Hold Shift on a skill for details.',
    }),
  );

  const off = deps.onChange(refresh);
  deps.setPaused(true);
  const handle = openPanel({
    id: SKILL_PANEL_ID,
    title: 'The Void',
    content,
    onClose: () => {
      off();
      for (const d of detach) d();
      deps.setPaused(false);
    },
  });
  refresh();
  // The viewport has its size only once the panel is in the page.
  requestAnimationFrame(reset);
  return handle;
}
