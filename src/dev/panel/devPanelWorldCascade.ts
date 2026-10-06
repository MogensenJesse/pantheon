// src/dev/panel/devPanelWorldCascade.ts — live whole-map shadow cascade tuning (DEV)
import {
  getWorldCascadeBakeCount,
  getWorldCascadeDefaults,
  getWorldCascadeShadowLight,
  getWorldCascadeTune,
  getWorldShadowView,
  invalidateWorldCascadeShadowMap,
  isWorldCascadeFrozen,
  resetWorldCascadeTune,
  setWorldCascadeFrozen,
  setWorldCascadeTune,
  setWorldShadowView,
  type WorldCascadeTune,
  type WorldShadowView,
  worldShadowTexelM,
} from '../../rendering/sunShadow';
import { bindCheckbox, bindRange, injectRangeRows, type RangeSpec, syncSlider } from '../bindRange';

type WorldRangeKey = Exclude<keyof WorldCascadeTune, 'mapSize'>;

const MAP_SIZE_OPTIONS = [1024, 2048, 4096, 8192] as const;

const DEFAULTS = getWorldCascadeDefaults();

function rangeSpec(
  key: WorldRangeKey,
  id: string,
  label: string,
  [min, max, step]: [number, number, number],
  digits: number,
): { key: WorldRangeKey; spec: RangeSpec } {
  return {
    key,
    spec: {
      id,
      label,
      min,
      max,
      step,
      defaultValue: DEFAULTS[key],
      format: (v) => v.toFixed(digits),
    },
  };
}

const SPECS = [
  rangeSpec(
    'filterRadiusTexels',
    'dev-world-filter-radius',
    'Filter radius (texels)',
    [0, 6, 0.05],
    2,
  ),
  rangeSpec(
    'refreshAngleDeg',
    'dev-world-refresh-angle',
    'Re-bake every (sun °)',
    [0, 1, 0.005],
    3,
  ),
  rangeSpec(
    'refreshMinIntervalMs',
    'dev-world-min-interval',
    'Min interval (ms)',
    [0, 1000, 10],
    0,
  ),
  rangeSpec('refreshMoveM', 'dev-world-refresh-move', 'Re-bake on move (m)', [8, 256, 4], 0),
  rangeSpec('fadeBandM', 'dev-world-fade-band', 'Far→world fade band (m)', [0, 150, 1], 0),
  rangeSpec('normalBias', 'dev-world-normal-bias', 'Normal bias (m)', [0, 5, 0.05], 2),
  rangeSpec('pushM', 'dev-world-push', 'Receiver push to sun (m)', [0, 16, 0.25], 2),
  rangeSpec(
    'foliageAlphaTest',
    'dev-world-foliage-alpha',
    'Foliage coverage cutoff',
    [0.05, 0.9, 0.01],
    2,
  ),
  rangeSpec('jitterTexels', 'dev-world-jitter', 'Bake jitter (texels)', [0, 2, 0.05], 2),
  rangeSpec('accumulateBakes', 'dev-world-accumulate', 'Bakes averaged', [1, 32, 1], 0),
  rangeSpec('marginM', 'dev-world-margin', 'Map margin (m)', [0, 400, 4], 0),
];

export const WORLD_CASCADE_SUBSECTION_HTML = `
      <details class="dev-subsection" id="dev-world-cascade">
        <summary>World cascade (past the far map)</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Whole-map sun shadow beyond the far map. Each bake is jittered and averaged into a world-XZ visibility texture, which receivers read. Tune changes re-bake at once; <code>shadows.lighting.world.filterSamples</code> and <code>visibilityRes</code> need a reload.</p>
          <p class="dev-hint" id="dev-world-status">—</p>
          <label class="dev-row">
            <span>World map resolution</span>
            <select id="dev-world-map-size">
              ${MAP_SIZE_OPTIONS.map((n) => `<option value="${n}">${n}×${n}</option>`).join('')}
            </select>
          </label>
          <div id="dev-world-cascade-rows"></div>
          <label class="dev-row">
            <span>View (debug)</span>
            <select id="dev-world-view">
              <option value="normal">Normal</option>
              <option value="everywhere">World term everywhere (compare near you)</option>
              <option value="off">Off past the far map</option>
              <option value="castOnly">Cast shadows only</option>
              <option value="facetOnly">Facet self-shadow only</option>
            </select>
          </label>
          <label class="dev-row dev-row-check">
            <span>Freeze re-bakes</span>
            <input type="checkbox" id="dev-world-freeze" />
          </label>
          <div class="dev-actions">
            <button type="button" id="dev-world-rebake">Re-bake now</button>
            <button type="button" id="dev-world-reset">Reset world cascade</button>
          </div>
        </div>
      </details>`;

function syncWorldCascadeUi(panel: HTMLDivElement): void {
  const tune = getWorldCascadeTune();
  for (const s of SPECS) {
    syncSlider(panel, s.spec.id, `${s.spec.id}-out`, tune[s.key], s.spec.format);
  }
  const sizeSelect = panel.querySelector('#dev-world-map-size') as HTMLSelectElement | null;
  if (sizeSelect) sizeSelect.value = String(tune.mapSize);
  const freeze = panel.querySelector('#dev-world-freeze') as HTMLInputElement | null;
  if (freeze) freeze.checked = isWorldCascadeFrozen();
  const viewSelect = panel.querySelector('#dev-world-view') as HTMLSelectElement | null;
  if (viewSelect) viewSelect.value = getWorldShadowView();
}

/** Shadows panel "Reset shadows" hook. */
export function resetWorldCascadeFromPanel(panel: HTMLDivElement): void {
  if (!getWorldCascadeShadowLight()) return;
  setWorldShadowView('normal');
  resetWorldCascadeTune();
  setWorldCascadeFrozen(false);
  syncWorldCascadeUi(panel);
}

/** Bind the World cascade subsection (call after its HTML is mounted). */
export function initWorldCascadeSubsection(panel: HTMLDivElement): () => void {
  const rows = panel.querySelector('#dev-world-cascade-rows');
  if (!rows) return () => {};
  if (!getWorldCascadeShadowLight()) {
    // Disabled in config, or the editor.
    panel.querySelector('#dev-world-cascade')?.setAttribute('hidden', '');
    return () => {};
  }
  injectRangeRows(
    rows as HTMLElement,
    SPECS.map((s) => s.spec),
  );
  syncWorldCascadeUi(panel);

  const disposers: Array<() => void> = [];
  for (const s of SPECS) {
    disposers.push(
      bindRange(panel, s.spec.id, `${s.spec.id}-out`, s.spec.format, (v) => {
        setWorldCascadeTune({ [s.key]: v });
      }),
    );
  }
  disposers.push(
    bindCheckbox(panel, 'dev-world-freeze', isWorldCascadeFrozen, setWorldCascadeFrozen),
  );

  const sizeSelect = panel.querySelector('#dev-world-map-size') as HTMLSelectElement | null;
  const onSize = () => {
    if (!sizeSelect) return;
    setWorldCascadeTune({ mapSize: Number(sizeSelect.value) });
    sizeSelect.value = String(getWorldCascadeTune().mapSize);
  };
  sizeSelect?.addEventListener('change', onSize);

  const viewSelect = panel.querySelector('#dev-world-view') as HTMLSelectElement | null;
  const onView = () => {
    if (viewSelect) setWorldShadowView(viewSelect.value as WorldShadowView);
  };
  viewSelect?.addEventListener('change', onView);

  const rebakeBtn = panel.querySelector('#dev-world-rebake') as HTMLButtonElement | null;
  const onRebake = () => invalidateWorldCascadeShadowMap();
  rebakeBtn?.addEventListener('click', onRebake);

  const resetBtn = panel.querySelector('#dev-world-reset') as HTMLButtonElement | null;
  const onReset = () => resetWorldCascadeFromPanel(panel);
  resetBtn?.addEventListener('click', onReset);

  // Live readout: texel size + measured bakes/sec.
  const status = panel.querySelector('#dev-world-status');
  let lastCount = getWorldCascadeBakeCount();
  let lastTime = performance.now();
  const timer = window.setInterval(() => {
    const now = performance.now();
    const count = getWorldCascadeBakeCount();
    const rate = ((count - lastCount) * 1000) / Math.max(1, now - lastTime);
    lastCount = count;
    lastTime = now;
    const t = getWorldCascadeTune();
    if (status) {
      status.textContent = `${t.mapSize}² · ${worldShadowTexelM(t.mapSize, t.marginM).toFixed(2)} m/texel · ${rate.toFixed(1)} bakes/s${isWorldCascadeFrozen() ? ' (frozen)' : ''}`;
    }
  }, 1000);

  return () => {
    for (const fn of disposers) fn();
    sizeSelect?.removeEventListener('change', onSize);
    viewSelect?.removeEventListener('change', onView);
    rebakeBtn?.removeEventListener('click', onRebake);
    resetBtn?.removeEventListener('click', onReset);
    window.clearInterval(timer);
  };
}
