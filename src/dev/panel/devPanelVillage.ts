// src/dev/panel/devPanelVillage.ts — village growth readouts and cheats (DEV)
import {
  type CrownTuning,
  crownTuning,
  resetCrownTuning,
} from '../../world/village/render/crownTuning';
import type { VillageSystemContext } from '../../world/village/VillageSystem';
import { forceRain, villageDevState } from '../../world/village/villageDevState';
import {
  bindCheckbox,
  bindRange,
  mountSection,
  type RangeSpec,
  rangeRowHtml,
  syncSpecs,
} from '../bindRange';
import { registerDevPanelLateTick } from '../panelTickHooks';
import { formatVillageReadout } from './devPanelVillageReadout';

export interface DevPanelVillageContext {
  village: VillageSystemContext;
}

const TIME_SCALES = [1, 4, 16, 64] as const;
const READOUT_INTERVAL_MS = 250;
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
      <p class="dev-hint">The village from the map's <code>villageSeed</code>: a hamlet that grows once converted (or a self-growing sandbox village when the map has no hamlet). <strong>Time scale</strong> fast-forwards village time only. <strong>Force presence</strong> pretends the orb is perceivable in Phase 0.</p>
      <div class="dev-hint dev-readout" id="dev-village-readout"></div>
      <div class="dev-row"><span>Time scale</span><span>${scaleButtons}</span></div>
      <label class="dev-row dev-row-check">
        <span>Force presence boost</span>
        <input type="checkbox" id="dev-village-force" />
      </label>
      <button type="button" class="dev-btn" id="dev-village-faith">+50 faith</button>
      <button type="button" class="dev-btn" id="dev-village-faith-big">+1000 faith</button>
      <button type="button" class="dev-btn" id="dev-village-wood">+20 wood</button>
      <button type="button" class="dev-btn" id="dev-village-food">+20 food</button>
      <button type="button" class="dev-btn" id="dev-village-rain">Force rain / follow weather</button>
      <button type="button" class="dev-btn" id="dev-village-fell">Fell 10 trees near the temple</button>
      <button type="button" class="dev-btn" id="dev-village-starve">Starve (empty larder, weak)</button>
      <button type="button" class="dev-btn" id="dev-village-kill">A villager dies</button>
      <button type="button" class="dev-btn" id="dev-village-spawn">+10 villagers</button>
      <button type="button" class="dev-btn" id="dev-village-site">Start site now</button>
      <button type="button" class="dev-btn" id="dev-village-complete">Complete open sites</button>
      <p class="dev-hint"><strong>Temple beacon</strong>: the orb, beam and light column over the temple appear once your energy reaches 100%, then grow with the faith gathered after that (beam and column grow to their full size at the faith set in <code>VISUAL.village.CROWN_*.MAX_FAITH</code>). Values are the strongest the effect gets.</p>
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
  listen(body.querySelector('#dev-village-rain'), () => {
    forceRain(villageDevState.rain01 === null ? 0.6 : null);
  });
  listen(body.querySelector('#dev-village-fell'), () =>
    village.dev.fellNear(village.sim.seed.x, village.sim.seed.z, 10),
  );
  listen(body.querySelector('#dev-village-starve'), () => village.dev.starve());
  listen(body.querySelector('#dev-village-kill'), () => village.dev.killOne());
  listen(body.querySelector('#dev-village-spawn'), () => village.dev.spawnVillagers(10));
  listen(body.querySelector('#dev-village-site'), () => village.dev.startSite());
  listen(body.querySelector('#dev-village-complete'), () => village.dev.completeSites());

  const readout = body.querySelector('#dev-village-readout');
  const details = body.closest('details');
  let last = 0;
  disposers.push(
    registerDevPanelLateTick(() => {
      const now = performance.now();
      // The stats walk every building and villager: do not collect them for a collapsed section.
      if (!readout || (details && !details.open) || now - last < READOUT_INTERVAL_MS) return;
      last = now;
      const s = village.sim.stats();
      readout.textContent = formatVillageReadout(s, {
        timeScale: villageDevState.timeScale,
        rain: village.rain(),
        rainForced: villageDevState.rain01 !== null,
      });
    }),
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}
