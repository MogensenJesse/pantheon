// src/dev/panel/devPanelVillage.ts — village growth readouts and cheats (DEV)
import { VILLAGE } from '../../config/village';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import { villageDevState } from '../../world/village/villageDevState';
import { bindCheckbox, mountSection } from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';

export interface DevPanelVillageContext {
  village: VillageSystemContext;
}

const TIME_SCALES = [1, 4, 16, 64] as const;
const READOUT_INTERVAL_MS = 250;
const pct = (share: number) => `${Math.round(share * 100)}%`;

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
      <button type="button" class="dev-btn" id="dev-village-spawn">+10 villagers</button>
      <button type="button" class="dev-btn" id="dev-village-site">Start site now</button>
      <button type="button" class="dev-btn" id="dev-village-complete">Complete open sites</button>
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
