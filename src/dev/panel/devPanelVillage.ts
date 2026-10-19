// src/dev/panel/devPanelVillage.ts — village growth readouts and cheats (DEV)
import { VILLAGE } from '../../config/village';
import {
  type CrownTuning,
  crownTuning,
  resetCrownTuning,
} from '../../world/village/render/crownTuning';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import { villageDevState } from '../../world/village/villageDevState';
import {
  bindCheckbox,
  bindRange,
  mountSection,
  type RangeSpec,
  rangeRowHtml,
  syncSpecs,
} from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';

export interface DevPanelVillageContext {
  village: VillageSystemContext;
}

const TIME_SCALES = [1, 4, 16, 64] as const;
const READOUT_INTERVAL_MS = 250;
const pct = (share: number) => `${Math.round(share * 100)}%`;

type BeaconSpec = RangeSpec & { key: keyof CrownTuning };

const beaconSpec = (
  key: keyof CrownTuning,
  label: string,
  min: number,
  max: number,
  step: number,
  digits = 2,
): BeaconSpec => ({
  key,
  id: `dev-beacon-${key}`,
  label,
  min,
  max,
  step,
  defaultValue: crownTuning[key],
  format: (v) => v.toFixed(digits),
});

/** Live temple beacon look: the orb, its thin beam and the light column (shown once energy reaches 100%). */
const BEACON_SPECS: readonly BeaconSpec[] = [
  beaconSpec('orbScale', 'Orb size', 1, 6, 0.1, 1),
  beaconSpec('beamHdrMax', 'Beam brightness', 0.1, 8, 0.05),
  beaconSpec('beamHalfWidthMax', 'Beam half width (m)', 0.02, 1, 0.01),
  beaconSpec('beamFadeM', 'Beam fade from orb (m)', 0, 12, 0.1, 1),
  beaconSpec('beamPulseIdle', 'Beam idle level', 0, 1, 0.01),
  beaconSpec('columnHdrMax', 'Column brightness', 0.02, 1, 0.01),
  beaconSpec('columnBaseRadiusMax', 'Column base radius (m)', 4, 20, 0.5, 1),
  beaconSpec('columnTopRadiusMax', 'Column top radius (m)', 0.5, 8, 0.1, 1),
  beaconSpec('columnBreathSpeed', 'Column pulse speed', 0, 4, 0.05),
  beaconSpec('columnBreathAmount', 'Column pulse depth', 0, 1, 0.01),
  beaconSpec('columnPulseIdle', 'Column band idle level', 0, 1, 0.01),
];

export function initDevPanelVillage(
  panel: HTMLDivElement,
  ctx: DevPanelVillageContext,
): () => void {
  const { village } = ctx;
  const scaleButtons = TIME_SCALES.map(
    (s) => `<button type="button" class="dev-btn" data-village-scale="${s}">x${s}</button>`,
  ).join(' ');
  const body = mountSection(panel, {
    hostId: 'dev-section-village',
    title: 'Village',
    open: false,
    body: `
      <p class="dev-hint">Self-growing village from the map's <code>villageSeed</code>. Faith accrues slowly and starts a building site every few minutes; the orb's presence speeds both up from Phase 1. <strong>Time scale</strong> fast-forwards village time only. <strong>Force presence</strong> pretends the orb is perceivable in Phase 0.</p>
      <div class="dev-hint" id="dev-village-readout" style="white-space: pre; font-family: monospace"></div>
      <div class="dev-row"><span>Time scale</span><span>${scaleButtons}</span></div>
      <label class="dev-row dev-row-check">
        <span>Force presence boost</span>
        <input type="checkbox" id="dev-village-force" />
      </label>
      <button type="button" class="dev-btn" id="dev-village-faith">+50 faith</button>
      <button type="button" class="dev-btn" id="dev-village-faith-big">+1000 faith</button>
      <button type="button" class="dev-btn" id="dev-village-wood">+20 wood</button>
      <button type="button" class="dev-btn" id="dev-village-food">+20 food</button>
      <button type="button" class="dev-btn" id="dev-village-starve">Starve (empty larder, weak)</button>
      <button type="button" class="dev-btn" id="dev-village-kill">A villager dies</button>
      <button type="button" class="dev-btn" id="dev-village-spawn">+10 villagers</button>
      <button type="button" class="dev-btn" id="dev-village-site">Start site now</button>
      <button type="button" class="dev-btn" id="dev-village-complete">Complete open sites</button>
      <p class="dev-hint"><strong>Temple beacon</strong>: the orb, beam and light column over the temple appear once your energy reaches 100%, then grow with the faith gathered after that (beam to 1500, column to 4500). Values are the strongest the effect gets.</p>
      ${BEACON_SPECS.map(rangeRowHtml).join('')}
      <button type="button" class="dev-btn" id="dev-beacon-reset">Reset beacon</button>
    `,
  });
  if (!body) return () => {};

  const disposers: Array<() => void> = [];
  const listen = (el: Element | null, fn: () => void) => {
    el?.addEventListener('click', fn);
    disposers.push(() => el?.removeEventListener('click', fn));
  };

  for (const button of body.querySelectorAll<HTMLButtonElement>('[data-village-scale]')) {
    listen(button, () => {
      villageDevState.timeScale = Number(button.dataset.villageScale);
    });
  }
  disposers.push(
    bindCheckbox(
      panel,
      'dev-village-force',
      () => villageDevState.forcePresence,
      (on) => {
        villageDevState.forcePresence = on;
      },
    ),
  );
  listen(body.querySelector('#dev-village-faith'), () => village.dev.addFaith(50));
  listen(body.querySelector('#dev-village-faith-big'), () => village.dev.addFaith(1000));
  for (const spec of BEACON_SPECS) {
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) => {
        crownTuning[spec.key] = v;
      }),
    );
  }
  listen(body.querySelector('#dev-beacon-reset'), () => {
    resetCrownTuning();
    syncSpecs(panel, BEACON_SPECS, (spec) => crownTuning[spec.key]);
  });
  listen(body.querySelector('#dev-village-wood'), () => village.dev.addWood(20));
  listen(body.querySelector('#dev-village-food'), () => village.dev.addFood(20));
  listen(body.querySelector('#dev-village-starve'), () => village.dev.starve());
  listen(body.querySelector('#dev-village-kill'), () => village.dev.killOne());
  listen(body.querySelector('#dev-village-spawn'), () => village.dev.spawnVillagers(10));
  listen(body.querySelector('#dev-village-site'), () => village.dev.startSite());
  listen(body.querySelector('#dev-village-complete'), () => village.dev.completeSites());

  const readout = body.querySelector('#dev-village-readout');
  let last = 0;
  disposers.push(
    registerDevPanelLateTick(() => {
      const now = performance.now();
      if (!readout || now - last < READOUT_INTERVAL_MS) return;
      last = now;
      const s = village.sim.stats();
      readout.textContent = [
        `buildings ${s.buildings}/${VILLAGE.PLAN.MAX_BUILDINGS}  finished ${s.finished}  open ${s.openSites}`,
        `faith ${s.faith.toFixed(1)}  +${s.rate.toFixed(3)}/s  boost ${s.boost01.toFixed(2)}  dwell ${s.dwell01.toFixed(2)}`,
        `hunger ${s.hunger}  dying ${s.dying}  graves ${s.graves}`,
        `wood ${s.wood.toFixed(0)}/${s.woodCap}  food ${s.food.toFixed(0)}/${s.foodCap}  eaten ${s.foodPerDay}/day`,
        `villagers ${s.villagers}/${s.beds} beds  fields ${s.fields}  asleep ${s.agents.asleep}  praying ${s.agents.praying}  working ${s.agents.working}  other ${s.agents.wandering}`,
        `A* ${s.path.requests} calls  ${s.path.failures} failed  ${(s.path.searchMs / Math.max(1, s.path.requests)).toFixed(2)} ms avg  queue ${s.agents.pathQueue}`,
        `rings ${s.ringCounts.join('/')}  roads ${s.network.links} links  ${s.network.radials} radials  connected ${pct(s.network.connectedShare)}  on a ring road ${pct(s.network.arcShare)}  skipped ${s.network.skipped}`,
        `planner relief x${s.reliefRelax.toFixed(2)}  failed passes ${s.failedPasses}`,
        `time scale x${villageDevState.timeScale}`,
      ].join('\n');
    }),
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}
