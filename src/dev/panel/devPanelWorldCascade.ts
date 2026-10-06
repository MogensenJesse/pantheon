// src/dev/panel/devPanelWorldCascade.ts — live whole-map shadow cascade tuning (DEV)
import { WORLD } from '../../config/world';
import {
  getWorldCascadeBakeCount,
  getWorldCascadeRenderedBakeCount,
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
} from '../../rendering/sunShadow';
import { bindCheckbox, bindRange, injectRangeRows, type RangeSpec, syncSlider } from '../bindRange';

type WorldRangeKey = Exclude<keyof WorldCascadeTune, 'mapSize'>;

const MAP_SIZE_OPTIONS = [1024, 2048, 4096, 8192] as const;

const SPECS: readonly { key: WorldRangeKey; spec: RangeSpec }[] = [
  {
    key: 'filterRadiusTexels',
    spec: {
      id: 'dev-world-filter-radius',
      label: 'Filter radius (texels)',
      min: 0,
      max: 6,
      step: 0.05,
      defaultValue: 1.75,
      format: (v) => v.toFixed(2),
    },
  },
  {
    key: 'refreshAngleDeg',
    spec: {
      id: 'dev-world-refresh-angle',
      label: 'Re-bake every (sun °)',
      min: 0,
      max: 1,
      step: 0.005,
      defaultValue: 0.05,
      format: (v) => v.toFixed(3),
    },
  },
  {
    key: 'refreshMinIntervalMs',
    spec: {
      id: 'dev-world-min-interval',
      label: 'Min interval (ms)',
      min: 0,
      max: 1000,
      step: 10,
      defaultValue: 100,
      format: (v) => v.toFixed(0),
    },
  },
  {
    key: 'refreshMoveM',
    spec: {
      id: 'dev-world-refresh-move',
      label: 'Re-bake on move (m)',
      min: 8,
      max: 256,
      step: 4,
      defaultValue: 64,
      format: (v) => v.toFixed(0),
    },
  },
  {
    key: 'fadeBandM',
    spec: {
      id: 'dev-world-fade-band',
      label: 'Far→world fade band (m)',
      min: 0,
      max: 150,
      step: 1,
      defaultValue: 40,
      format: (v) => v.toFixed(0),
    },
  },
  {
    key: 'normalBias',
    spec: {
      id: 'dev-world-normal-bias',
      label: 'Normal bias (m)',
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 1.2,
      format: (v) => v.toFixed(2),
    },
  },
  {
    key: 'pushM',
    spec: {
      id: 'dev-world-push',
      label: 'Receiver push to sun (m)',
      min: 0,
      max: 16,
      step: 0.25,
      defaultValue: 4,
      format: (v) => v.toFixed(2),
    },
  },
  {
    key: 'foliageAlphaTest',
    spec: {
      id: 'dev-world-foliage-alpha',
      label: 'Foliage coverage cutoff',
      min: 0.05,
      max: 0.9,
      step: 0.01,
      defaultValue: 0.3,
      format: (v) => v.toFixed(2),
    },
  },
  {
    key: 'jitterTexels',
    spec: {
      id: 'dev-world-jitter',
      label: 'Bake jitter (texels)',
      min: 0,
      max: 2,
      step: 0.05,
      defaultValue: 1,
      format: (v) => v.toFixed(2),
    },
  },
  {
    key: 'accumulateBakes',
    spec: {
      id: 'dev-world-accumulate',
      label: 'Bakes averaged',
      min: 1,
      max: 32,
      step: 1,
      defaultValue: 8,
      format: (v) => v.toFixed(0),
    },
  },
  {
    key: 'marginM',
    spec: {
      id: 'dev-world-margin',
      label: 'Map margin (m)',
      min: 0,
      max: 400,
      step: 4,
      defaultValue: 64,
      format: (v) => v.toFixed(0),
    },
  },
];

export const WORLD_CASCADE_SUBSECTION_HTML = `
      <details class="dev-subsection">
        <summary>World cascade (beyond 200 m)</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Coarse whole-map sun shadow past the ±200 m far map. Bigger map = sharper/steadier far casters but costlier bakes. Receivers read a smoothed world-XZ visibility resolve, so re-bakes fade in. Push / margin / size re-bake immediately. Filter samples need a reload (<code>shadows.lighting.world.filterSamples</code>).</p>
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
              <option value="off">Off past 200 m</option>
              <option value="castOnly">Cast shadows only</option>
              <option value="facetOnly">Facet self-shadow only</option>
              <option value="marker">Marker: ring 30–40 m around you + origin cross</option>
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

function texelMetres(mapSize: number, marginM: number): number {
  // Matches worldShadowHalfExtentM: map bounding-sphere radius + margin.
  const h = WORLD.SIZE * 0.5;
  const half = Math.hypot(h, h, WORLD.HEIGHT_SCALE * 0.5) + marginM;
  return (half * 2) / mapSize;
}

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

/** Bind the World cascade subsection (call after its HTML is mounted). */
export function initWorldCascadeSubsection(panel: HTMLDivElement): () => void {
  const rows = panel.querySelector('#dev-world-cascade-rows');
  const status = panel.querySelector('#dev-world-status');
  if (!rows) return () => {};
  if (!getWorldCascadeShadowLight()) {
    if (status) status.textContent = 'World cascade inactive (disabled in config or editor).';
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
    bindCheckbox(panel, 'dev-world-freeze', isWorldCascadeFrozen, (on) => {
      setWorldCascadeFrozen(on);
    }),
  );

  const sizeSelect = panel.querySelector('#dev-world-map-size') as HTMLSelectElement | null;
  const onSize = () => {
    if (!sizeSelect) return;
    setWorldCascadeTune({ mapSize: Number(sizeSelect.value) });
    sizeSelect.value = String(getWorldCascadeTune().mapSize);
  };
  sizeSelect?.addEventListener('change', onSize);

  const rebakeBtn = panel.querySelector('#dev-world-rebake') as HTMLButtonElement | null;
  const onRebake = () => invalidateWorldCascadeShadowMap();
  rebakeBtn?.addEventListener('click', onRebake);

  const resetBtn = panel.querySelector('#dev-world-reset') as HTMLButtonElement | null;
  const viewSelect = panel.querySelector('#dev-world-view') as HTMLSelectElement | null;
  const onView = () => {
    if (viewSelect) setWorldShadowView(viewSelect.value as WorldShadowView);
  };
  viewSelect?.addEventListener('change', onView);

  const onReset = () => {
    setWorldShadowView('normal');
    resetWorldCascadeTune();
    setWorldCascadeFrozen(false);
    syncWorldCascadeUi(panel);
  };
  resetBtn?.addEventListener('click', onReset);

  // Live readout: texel size + measured bakes/sec.
  let lastCount = getWorldCascadeBakeCount();
  let lastRendered = getWorldCascadeRenderedBakeCount();
  let lastTime = performance.now();
  const timer = window.setInterval(() => {
    const now = performance.now();
    const count = getWorldCascadeBakeCount();
    const rendered = getWorldCascadeRenderedBakeCount();
    const rate = ((count - lastCount) * 1000) / Math.max(1, now - lastTime);
    const renderedRate = ((rendered - lastRendered) * 1000) / Math.max(1, now - lastTime);
    lastCount = count;
    lastRendered = rendered;
    lastTime = now;
    const t = getWorldCascadeTune();
    if (status) {
      status.textContent = `${t.mapSize}² · ${texelMetres(t.mapSize, t.marginM).toFixed(2)} m/texel · ${rate.toFixed(1)} bakes/s (${renderedRate.toFixed(1)} rendered)${isWorldCascadeFrozen() ? ' (frozen)' : ''}`;
    }
  }, 1000);

  return () => {
    for (const fn of disposers) fn();
    sizeSelect?.removeEventListener('change', onSize);
    rebakeBtn?.removeEventListener('click', onRebake);
    resetBtn?.removeEventListener('click', onReset);
    viewSelect?.removeEventListener('change', onView);
    window.clearInterval(timer);
  };
}

/** Shadows panel "Reset shadows" hook. */
export function resetWorldCascadeFromPanel(panel: HTMLDivElement): void {
  if (!getWorldCascadeShadowLight()) return;
  setWorldShadowView('normal');
  resetWorldCascadeTune();
  setWorldCascadeFrozen(false);
  syncWorldCascadeUi(panel);
}
