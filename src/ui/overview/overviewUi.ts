// src/ui/overview/overviewUi.ts — what the village overview shows and lets you click
//
// Over the 3D view: a ring and a name on whatever is under the mouse, a ring on the selected thing, a row
// of bed dots on each finished home (amber when the village has no free bed), and a chip with souls and
// beds. A click on a villager, building or field opens a non-modal info panel on the right; a click on
// empty ground closes it. All of it follows the overview: it is gone when the overview is left.

import './overview.css';
import { type PerspectiveCamera, Vector3 } from 'three';
import { PHASE0 } from '../../config/phase0';
import { bus } from '../../core/EventBus';
import type { Overview } from '../../overview/overviewController';
import {
  bedSummary,
  type Description,
  describe,
  describeWorldOf,
  nameOf,
  residentsPerBuilding,
} from '../../overview/overviewDescribe';
import {
  buildingHeightM,
  type PickRay,
  pickTarget,
  type Selection,
  sameSelection,
  VILLAGER_BODY_M,
} from '../../overview/overviewPick';
import { modifiers } from '../../skills/modifiers';
import { bedsOf } from '../../world/village/model/buildings';
import { shortages } from '../../world/village/sim/economy';
import { stageOf } from '../../world/village/sim/hunger';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import {
  button,
  closePanel,
  createContextualHud,
  getLayer,
  h,
  isModalPanelOpen,
  openPanel,
  type PanelHandle,
} from '../kit';
import { createMarkerLayer, projectToScreen, type ScreenPoint } from '../overlay';
import { count, hungerLabel } from '../village/villageText.ts';

const PIPS_MAX_DISTANCE_M = PHASE0.OVERVIEW.PIPS_MAX_DISTANCE_M;
const PIPS_MAX = PHASE0.OVERVIEW.PIPS_MAX;
const PANEL_REFRESH_MS = 250;
const PANEL_ID = 'overview-info';

export interface OverviewUiDeps {
  overview: Overview;
  camera: PerspectiveCamera;
  village: VillageSystemContext;
  groundY: (x: number, z: number) => number;
  /** Whether the milestone that opens Hearten has been reached. */
  heartenUnlocked: () => boolean;
}

export interface OverviewUi {
  /** What is under the mouse now (the same pick a click uses), or null. */
  pickAtMouse: () => Selection | null;
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

  const rings = createMarkerLayer(camera, 'po-ring');
  const tips = createMarkerLayer(camera, 'bp-tip');
  const pips = createMarkerLayer(camera, 'bp-pips');
  const prayersLayer = createMarkerLayer(camera, 'bp-prayer');
  const residents = new Map<number, number>();
  const pipText = new Map<string, string>();

  const world = describeWorldOf(sim, { heartenUnlocked: deps.heartenUnlocked });

  // --- the chip --------------------------------------------------------------------------------

  const chip = h('div', { class: 'bp-chip' });
  getLayer('hud').appendChild(chip);
  const chipHud = createContextualHud(chip, { base: 'hidden' });
  let chipText = '';

  // --- picking ---------------------------------------------------------------------------------

  const screen: ScreenPoint = { x: 0, y: 0, depth: 0 };
  const project = (x: number, y: number, z: number) =>
    projectToScreen(camera, x, y, z, screen) ? screen : null;
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
              role: 'progressbar',
              'aria-label': desc.bar.label,
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuenow': Math.round(desc.bar.value * 100),
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
                    on: { click: () => select(target) },
                  },
                  ...content,
                )
              : h('div', { class: 'ov-row' }, ...content),
          ),
        );
      }
      out.push(list);
    }
    const raise = desc.upgrade;
    if (raise) {
      const btn = button(raise.label, () => void village.upgrade(raise.id), { class: 'ov-goto' });
      btn.disabled = !raise.enabled;
      out.push(btn, h('p', { class: 'ov-sub', text: raise.note }));
    }
    const touch = desc.hearten;
    if (touch) {
      const btn = button(touch.label, () => void village.hearten(touch.villager), {
        class: 'ov-goto',
      });
      btn.disabled = !touch.enabled;
      out.push(btn, h('p', { class: 'ov-sub', text: touch.note }));
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
      desc.upgrade,
      desc.hearten,
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

  // A villager who dies leaves the pool and the last one takes their slot: the selection follows.
  const offDied = bus.on('village:villagerDied', ({ villager, moved }) => {
    if (selected?.kind !== 'villager') return;
    if (selected.index === villager) select(null);
    else if (moved >= 0 && selected.index === moved)
      selected = { kind: 'villager', index: villager };
  });

  const offClick = overview.onClick(() => {
    if (isModalPanelOpen()) return false;
    select(pickAtMouse());
    return true;
  });

  // --- the frame -------------------------------------------------------------------------------

  const hideAll = () => {
    rings.hideAll();
    tips.hideAll();
    pips.hideAll();
    prayersLayer.hideAll();
    chipHud.setBase('hidden');
  };

  let wasActive = false;
  /** The bed count and who sleeps where, as of the last 4 Hz look. */
  let summary = bedSummary(sim.buildings, sim.villagers.count);
  let statsAt = Number.NEGATIVE_INFINITY;
  const tick = () => {
    if (!overview.capturesMovement()) {
      if (wasActive) {
        wasActive = false;
        statsAt = Number.NEGATIVE_INFINITY;
        hover = null;
        selected = null;
        closeInfo();
        hideAll();
      }
      return;
    }
    wasActive = true;
    hover = isModalPanelOpen() ? null : pickAtMouse();

    rings.begin();
    tips.begin();
    if (hover && !sameSelection(hover, selected)) {
      const a = anchorOf(hover);
      if (a) rings.add(a.x, a.y, a.z, a.ringM);
    }
    if (selected) {
      const a = anchorOf(selected);
      if (a) rings.add(a.x, a.y, a.z, a.ringM).state = 'is-active';
    }
    if (hover) {
      const a = anchorOf(hover);
      const name = nameOf(hover, world);
      if (a && name) tips.add(a.x, a.tipY, a.z, 0.9).label = name;
    }
    rings.flush();
    tips.flush();

    // The bed dots follow the camera every frame; who sleeps where, and the chip, change slowly: 4 Hz.
    const now = performance.now();
    const statsDue = now - statsAt >= PANEL_REFRESH_MS;
    if (statsDue) {
      statsAt = now;
      summary = bedSummary(sim.buildings, sim.villagers.count);
      residentsPerBuilding(sim.villagers, residents);
    }
    prayersLayer.begin();
    for (const prayer of sim.prayers.open) {
      const a = anchorOf({ kind: 'villager', index: prayer.villager });
      if (a) prayersLayer.add(a.x, a.tipY + 0.6, a.z, 0.9).label = '✦';
    }
    for (const lifted of sim.hearten) {
      if (lifted.left <= 0) continue;
      const a = anchorOf({ kind: 'villager', index: lifted.villager });
      if (a) prayersLayer.add(a.x, a.tipY + 0.6, a.z, 0.9).label = '✧';
    }
    prayersLayer.flush();
    pips.begin();
    if (overview.distance() < PIPS_MAX_DISTANCE_M) {
      for (const b of sim.buildings) {
        const beds = bedsOf(b, modifiers.bedsPerHouseAdd);
        if (beds <= 0) continue;
        if (pips.size() >= PIPS_MAX) break;
        const filled = Math.min(residents.get(b.id) ?? 0, beds);
        const key = `${filled}/${beds}`;
        let text = pipText.get(key);
        if (text === undefined) {
          text = '●'.repeat(filled) + '○'.repeat(beds - filled);
          pipText.set(key, text);
        }
        const pip = pips.add(b.x, groundY(b.x, b.z) + buildingHeightM(b.type, b.stage) + 1, b.z, 1);
        pip.state = summary.full ? 'is-warn' : undefined;
        pip.label = text;
      }
    }
    pips.flush();

    if (statsDue) {
      const { stock } = sim.economy;
      const short = shortages(stock, summary.souls);
      const hunger = stageOf(sim.hunger, sim.economy.hungry);
      const text = [
        count(summary.souls, 'soul'),
        count(summary.beds, 'bed'),
        `wood ${Math.floor(stock.wood)}`,
        `food ${Math.floor(stock.food)}`,
        summary.full ? 'no free beds' : '',
        short.food ? 'low food' : '',
        short.wood ? 'low wood' : '',
        hungerLabel(hunger),
      ]
        .filter(Boolean)
        .join(' · ');
      if (text !== chipText) {
        chipText = text;
        chip.textContent = text;
      }
      chip.classList.toggle(
        'is-full',
        summary.full || short.food || short.wood || hunger !== 'fed',
      );
    }
    chipHud.setBase('persistent');

    // The panel follows what it describes; a thing that is gone closes it.
    if (selected) {
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
    pickAtMouse,
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
      offDied();
      offClick();
      offFrame();
      closeInfo();
      rings.dispose();
      prayersLayer.dispose();
      tips.dispose();
      pips.dispose();
      chipHud.dispose();
      chip.remove();
    },
  };
}
