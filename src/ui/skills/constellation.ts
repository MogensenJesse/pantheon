// src/ui/skills/constellation.ts — the skill tree drawn into a layer: one SVG of lines and a real
// button for each node (Tab walks them, Enter takes one); `refresh` brings them up to date with the state

import type { SkillNode, SkillsState } from '../../skills/skillTree';
import { NODE_SPACING_PX, nodeStatus, nodeTooltip, treeEdges } from '../../skills/skillView';
import { attachTooltip, h, icon } from '../kit';

export interface Constellation {
  /** Sets each node's status and label and lights the lines that lead on from taken nodes. */
  refresh: (state: SkillsState) => void;
  dispose: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createConstellation(
  tree: readonly SkillNode[],
  world: HTMLElement,
  options: {
    state: () => SkillsState;
    /** A node was chosen. */
    onTake: (node: SkillNode) => void;
  },
): Constellation {
  const byId = new Map(tree.map((n) => [n.id, n]));

  // The lines between nodes.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sk-edges');
  const edgeEls: { el: SVGLineElement; from: SkillNode }[] = [];
  for (const edge of treeEdges(tree)) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(a.x * NODE_SPACING_PX));
    line.setAttribute('y1', String(a.y * NODE_SPACING_PX));
    line.setAttribute('x2', String(b.x * NODE_SPACING_PX));
    line.setAttribute('y2', String(b.y * NODE_SPACING_PX));
    svg.appendChild(line);
    edgeEls.push({ el: line, from: a });
  }
  world.appendChild(svg);

  // The nodes.
  const nodeEls = new Map<string, HTMLButtonElement>();
  const detach: (() => void)[] = [];
  for (const node of tree) {
    const nodeButton = h(
      'button',
      {
        class: 'sk-node',
        attrs: { type: 'button', 'data-node': node.id },
        style: { left: `${node.x * NODE_SPACING_PX}px`, top: `${node.y * NODE_SPACING_PX}px` },
        on: { click: () => options.onTake(node) },
      },
      h('span', { class: 'sk-node__gem' }, icon('spark', { size: '1.1em' })),
      h('span', { class: 'sk-node__name', text: node.name }),
    );
    detach.push(
      attachTooltip(nodeButton, () => {
        const t = nodeTooltip(options.state(), node, tree);
        return { title: t.title, body: t.body, inspect: t.inspect };
      }),
    );
    nodeEls.set(node.id, nodeButton);
    world.appendChild(nodeButton);
  }

  return {
    refresh: (state) => {
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
        e.el.classList.toggle('is-lit', nodeStatus(state, e.from, tree) === 'taken');
      }
    },
    dispose: () => {
      for (const d of detach) d();
    },
  };
}
