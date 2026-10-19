// src/overview/overviewUi.ts — what the village overview shows and lets you click (M3b)
//
// Over the 3D view: a ring and a name on whatever is under the mouse, a ring on the selected thing, a row
// of bed dots on each finished home (amber when the village has no free bed), and a chip with souls and
// beds. A click on a villager, building or field opens a non-modal info panel on the right; a click on
// empty ground closes it. All of it follows the overview: it is gone when the overview is left.

import { type PerspectiveCamera, Vector3 } from 'three';
import {
  button,
  closePanel,
  createContextualHud,
  getLayer,
  h,
  isModalPanelOpen,
  openPanel,
  type PanelHandle,
} from '../ui/kit';
import { createMarkerPool, createSpecList } from '../ui/overlay';
import { bedsOf } from '../world/village/model/buildings';
import { shortages } from '../world/village/sim/economy';
import type { VillageSystemContext } from '../world/village/VillageSystem';
import type { Overview } from './overviewController';
import {
  bedSummary,
  type Description,
  describe,
  nameOf,
  residentsPerBuilding,
} from './overviewDescribe';
import {
  buildingHeightM,
  type PickRay,
  pickTarget,
  type Selection,
  sameSelection,
  VILLAGER_BODY_M,
} from './overviewPick';

/** Bed dots show when the camera is closer than this (m), so a wide view stays quiet. */
const PIPS_MAX_DISTANCE_M = 120;
const PIPS_MAX = 80;
const PANEL_REFRESH_MS = 250;
const PANEL_ID = 'overview-info';

export interface OverviewUiDeps {
  overview: Overview;
  camera: PerspectiveCamera;
  village: VillageSystemContext;
  groundY: (x: number, z: number) => number;
}

export interface OverviewUi {
  selection: () => Selection | null;
  hovered: () => Selection | null;
  select: (sel: Selection | null) => void;
  /** Where a thing is on the screen (client px), or null. */
  screenOf: (sel: Selection) => { x: number; y: number } | null;
  dispose: () => void;
}

interface Anchor {
  x: number;
  y: number;
  z: number;
  /** Ring size (m). */
  ringM: number;
  /** Height above the ground the name hangs at (m). */
  tipY: number;
}

export function createOverviewUi(deps: OverviewUiDeps): OverviewUi {
  const { overview, camera, village, groundY } = deps;
  const { sim } = village;

  const rings = createMarkerPool(camera, 'po-ring');
  const tips = createMarkerPool(camera, 'bp-tip');
  const pips = createMarkerPool(camera, 'bp-pips');
  const ringSpecs = createSpecList();
  const tipSpecs = createSpecList();
  const pipSpecs = createSpecList();
  const residents = new Map<number, number>();
  const pipText = new Map<string, string>();

  const world = {
    get buildings() {
      return sim.buildings;
    },
    get fields() {
      return sim.fields;
    },
    get villagers() {
      return sim.villagers;
    },
    get elder() {
      return sim.elder;
    },
    get believers() {
      return sim.believers();
    },
    get stock() {
      const { stock } = sim.economy;
      const caps = sim.economy.caps();
      return { wood: stock.wood, food: stock.food, woodCap: caps.wood, foodCap: caps.food };
    },
  };

  // --- the chip --------------------------------------------------------------------------------

  const chip = h('div', { class: 'bp-chip' });
  getLayer('hud').appendChild(chip);
  const chipHud = createContextualHud(chip, { base: 'hidden' });
  let chipText = '';

  // --- picking ---------------------------------------------------------------------------------

  const v3 = new Vector3();
  const screen = { x: 0, y: 0 };
  const project = (x: number, y: number, z: number) => {
    v3.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    if (-v3.z <= 0.1) return null;
    v3.applyMatrix4(camera.projectionMatrix);
    screen.x = (v3.x * 0.5 + 0.5) * window.innerWidth;
    screen.y = (-v3.y * 0.5 + 0.5) * window.innerHeight;
    return screen;
  };
  const rayOrigin = new Vector3();
  const rayDir = new Vector3();
  const ray: PickRay = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };

  const pickAtMouse = (): Selection | null => {
    const m = overview.mouse();
    if (!m.inside) return null;
    const hasRay = overview.mouseRay(rayOrigin, rayDir);
    if (hasRay) {
      ray.ox = rayOrigin.x;
      ray.oy = rayOrigin.y;
      ray.oz = rayOrigin.z;
      ray.dx = rayDir.x;
      ray.dy = rayDir.y;
      ray.dz = rayDir.z;
    }
    const ground = overview.hoverPoint();
    return pickTarget({
      mouse: m,
      ray: hasRay ? ray : null,
      ground,
      world,
      groundY,
      project,
    });
  };

  const anchorOf = (sel: Selection): Anchor | null => {
    if (sel.kind === 'villager') {
      const v = sim.villagers;
      if (sel.index >= v.count) return null;
      const x = v.x[sel.index]!;
      const z = v.z[sel.index]!;
      const g = groundY(x, z);
      return { x, y: g + VILLAGER_BODY_M, z, ringM: 1.4, tipY: g + 2.4 };
    }
    if (sel.kind === 'field') {
      const f = sim.fields.find((o) => o.id === sel.id);
      if (!f) return null;
      const g = groundY(f.x, f.z);
      return { x: f.x, y: g + 0.3, z: f.z, ringM: Math.max(f.halfW, f.halfD) * 2.2, tipY: g + 1.5 };
    }
    const b = sim.buildings.find((o) => o.id === sel.id);
    if (!b) return null;
    const g = groundY(b.x, b.z);
    const height = buildingHeightM(b.type, b.stage);
    return {
      x: b.x,
      y: g + height / 2,
      z: b.z,
      ringM: Math.max(b.halfW, b.halfD) * 2.6,
      tipY: g + height + 2.6,
    };
  };

  // --- the info panel --------------------------------------------------------------------------

  let selected: Selection | null = null;
  let hover: Selection | null = null;
  let panel: PanelHandle | null = null;
  let panelBody: HTMLElement | null = null;
  let panelSig = '';
  let panelAt = 0;
  let closing = false;

  const selectRow = (sel: Selection) => select(sel);

  const renderBody = (desc: Description): HTMLElement[] => {
    const out: HTMLElement[] = [];
    if (desc.subtitle) out.push(h('p', { class: 'ov-sub', text: desc.subtitle }));
    if (desc.bar) {
      out.push(
        h(
          'div',
          {
            class: 'ov-bar',
            attrs: {
              role: 'img',
              'aria-label': `${desc.bar.label} ${Math.round(desc.bar.value * 100)}%`,
            },
          },
          h('span', {
            class: 'ov-bar__fill',
            style: { width: `${Math.round(desc.bar.value * 100)}%` },
          }),
        ),
      );
    }
    if (desc.rows.length > 0) {
      const list = h('ul', { class: 'ov-rows' });
      for (const row of desc.rows) {
        const content = [
          h('span', { class: 'ov-row__label', text: row.label }),
          h('span', { class: 'ov-row__value', text: row.value }),
        ];
        const target = row.target;
        list.appendChild(
          h(
            'li',
            null,
            target
              ? h(
                  'button',
                  {
                    class: 'ov-row ov-row--link',
                    attrs: { type: 'button' },
                    on: { click: () => selectRow(target) },
                  },
                  ...content,
                )
              : h('div', { class: 'ov-row' }, ...content),
          ),
        );
      }
      out.push(list);
    }
    const goTo = desc.goTo;
    if (goTo)
      out.push(button('Go to', () => overview.focusOn(goTo.x, goTo.z), { class: 'ov-goto' }));
    return out;
  };

  const showPanel = (desc: Description) => {
    const sig = JSON.stringify([
      desc.title,
      desc.subtitle,
      desc.rows,
      desc.bar && [desc.bar.label, Math.round(desc.bar.value * 100)],
    ]);
    if (!panel) {
      panelBody = h('div', { class: 'ov-info' });
      panel = openPanel({
        id: PANEL_ID,
        title: desc.title,
        content: panelBody,
        modal: false,
        onClose: () => {
          panel = null;
          panelBody = null;
          panelSig = '';
          if (!closing) selected = null;
        },
      });
      // The keys stay the game's: nothing in the panel keeps the focus.
      (document.activeElement as HTMLElement | null)?.blur?.();
    } else if (sig === panelSig) {
      return;
    }
    panelSig = sig;
    panel.element.querySelector('.k-panel__title')!.textContent = desc.title;
    panelBody!.replaceChildren(...renderBody(desc));
  };

  const closeInfo = () => {
    if (!panel) return;
    closing = true;
    closePanel(PANEL_ID);
    closing = false;
  };

  function select(sel: Selection | null): void {
    selected = sel;
    panelAt = 0;
    if (!sel) {
      closeInfo();
      return;
    }
    const desc = describe(sel, world);
    if (desc) showPanel(desc);
    else closeInfo();
  }

  const offClick = overview.onClick(() => {
    if (isModalPanelOpen()) return;
    select(pickAtMouse());
  });

  // --- the frame -------------------------------------------------------------------------------

  const hideAll = () => {
    rings.hideAll();
    tips.hideAll();
    pips.hideAll();
    chipHud.setBase('hidden');
  };

  let wasActive = false;
  const tick = () => {
    if (!overview.capturesMovement()) {
      if (wasActive) {
        wasActive = false;
        hover = null;
        selected = null;
        closeInfo();
        hideAll();
      }
      return;
    }
    wasActive = true;
    hover = isModalPanelOpen() ? null : pickAtMouse();

    ringSpecs.begin();
    tipSpecs.begin();
    if (hover && !sameSelection(hover, selected)) {
      const a = anchorOf(hover);
      if (a) ringSpecs.add(a.x, a.y, a.z, a.ringM);
    }
    if (selected) {
      const a = anchorOf(selected);
      if (a) ringSpecs.add(a.x, a.y, a.z, a.ringM, undefined, 'is-active');
    }
    const named = hover ?? null;
    if (named) {
      const a = anchorOf(named);
      const name = nameOf(named, world);
      if (a && name) tipSpecs.add(a.x, a.tipY + 0, a.z, 0.9, undefined, undefined, name);
    }
    rings.show(ringSpecs.list(), ringSpecs.size());
    tips.show(tipSpecs.list(), tipSpecs.size());

    // The bed dots and the chip.
    const summary = bedSummary(sim.buildings, sim.villagers.count);
    pipSpecs.begin();
    if (overview.distance() < PIPS_MAX_DISTANCE_M) {
      residentsPerBuilding(sim.villagers, residents);
      for (const b of sim.buildings) {
        const beds = bedsOf(b);
        if (beds <= 0) continue;
        if (pipSpecs.size() >= PIPS_MAX) break;
        const filled = Math.min(residents.get(b.id) ?? 0, beds);
        const key = `${filled}/${beds}`;
        let text = pipText.get(key);
        if (text === undefined) {
          text = '●'.repeat(filled) + '○'.repeat(beds - filled);
          pipText.set(key, text);
        }
        pipSpecs.add(
          b.x,
          groundY(b.x, b.z) + buildingHeightM(b.type, b.stage) + 1,
          b.z,
          1,
          undefined,
          summary.full ? 'is-warn' : undefined,
          text,
        );
      }
    }
    pips.show(pipSpecs.list(), pipSpecs.size());

    const { stock } = sim.economy;
    const short = shortages(stock, summary.souls);
    const text = [
      `${summary.souls} ${summary.souls === 1 ? 'soul' : 'souls'}`,
      `${summary.beds} ${summary.beds === 1 ? 'bed' : 'beds'}`,
      `wood ${Math.floor(stock.wood)}`,
      `food ${Math.floor(stock.food)}`,
      summary.full ? 'no free beds' : '',
      short.food ? 'low food' : '',
      short.wood ? 'low wood' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (text !== chipText) {
      chipText = text;
      chip.textContent = text;
    }
    chip.classList.toggle('is-full', summary.full || short.food || short.wood);
    chipHud.setBase('persistent');

    // The panel follows what it describes; a thing that is gone closes it.
    if (selected) {
      const now = performance.now();
      if (now - panelAt >= PANEL_REFRESH_MS) {
        panelAt = now;
        const desc = describe(selected, world);
        if (desc) showPanel(desc);
        else {
          selected = null;
          closeInfo();
        }
      }
    }
  };
  const offFrame = overview.onFrame(tick);

  return {
    selection: () => selected,
    hovered: () => hover,
    select,
    screenOf: (sel) => {
      const a = anchorOf(sel);
      if (!a) return null;
      const p = project(a.x, a.y, a.z);
      return p ? { x: p.x, y: p.y } : null;
    },
    dispose: () => {
      offClick();
      offFrame();
      closeInfo();
      rings.dispose();
      tips.dispose();
      pips.dispose();
      chipHud.dispose();
      chip.remove();
    },
  };
}
