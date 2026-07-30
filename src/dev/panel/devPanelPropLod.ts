// src/dev/panel/devPanelPropLod.ts — map prop distance LOD tunables (DEV)
import {
  getPropLodTuning,
  isPropLodDebugEnabled,
  resetPropLodTuning,
  setPropLodDebug,
  setPropLodTuning,
} from '../../world/mapProps/config/propLodConfig';
import { markPropLodGroupsDirty, type PropLodGroup } from '../../world/mapProps/mapPropLod';
import { bindCheckbox, bindRange, injectRangeRows, mountSection, syncSlider } from '../bindRange';

const fmtM = (v: number) => `${v.toFixed(0)} m`;

const DIST_SPECS = [
  {
    id: 'dev-prop-lod-near',
    label: 'Near max (lod0)',
    min: 5,
    max: 200,
    step: 1,
    key: 'nearMaxM' as const,
    format: fmtM,
  },
  {
    id: 'dev-prop-lod-mid',
    label: 'Mid max (lod1)',
    min: 10,
    max: 300,
    step: 1,
    key: 'midMaxM' as const,
    format: fmtM,
  },
  {
    id: 'dev-prop-lod-far',
    label: 'Far max (lod2)',
    min: 20,
    max: 500,
    step: 1,
    key: 'farMaxM' as const,
    format: fmtM,
  },
  {
    id: 'dev-prop-lod-rebin',
    label: 'Rebin threshold',
    min: 1,
    max: 20,
    step: 0.5,
    key: 'rebinThresholdM' as const,
    format: (v: number) => `${v.toFixed(1)} m`,
  },
  {
    id: 'dev-prop-lod-hysteresis',
    label: 'Band hysteresis',
    min: 0,
    max: 30,
    step: 1,
    key: 'hysteresisM' as const,
    format: fmtM,
  },
] as const;

export interface DevPanelPropLodContext {
  propLodGroups: PropLodGroup[];
}

export function initDevPanelPropLod(
  panel: HTMLDivElement,
  ctx: DevPanelPropLodContext,
): () => void {
  const tuning = getPropLodTuning();
  const body = mountSection(panel, {
    hostId: 'dev-section-prop-lod',
    title: 'Prop LOD',
    open: false,
    body: `
      <p class="dev-hint">Distance bands for map-prop mesh LOD (lod0 full / lod1 mid / lod2 far from <code>bake:play-props</code>). Beyond far max, instances are culled. <strong>Rebin threshold</strong> = how far the player must walk before placements are re-sorted into bands. <strong>Band hysteresis</strong> = sticky margin so LODs (and shadow casters) do not thrash at cuts. Shadows cast from lod0–lod2 when <code>shadowCastMaxLod ≥ 2</code>. <strong>LOD color debug</strong>: green = lod0, blue = lod1, magenta = lod2.</p>
      <label class="dev-row dev-row-check">
        <span>Enable distance LOD</span>
        <input type="checkbox" id="dev-prop-lod-enabled" ${tuning.enabled ? 'checked' : ''} />
      </label>
      <label class="dev-row dev-row-check">
        <span>LOD color debug</span>
        <input type="checkbox" id="dev-prop-lod-color-debug" />
      </label>
      <div id="dev-prop-lod-dist-rows"></div>
      <button type="button" class="dev-btn" id="dev-prop-lod-reset">Reset prop LOD</button>
    `,
  });
  if (!body) return () => {};

  const distHost = body.querySelector('#dev-prop-lod-dist-rows');
  if (distHost) {
    injectRangeRows(
      distHost,
      DIST_SPECS.map((s) => ({
        id: s.id,
        label: s.label,
        min: s.min,
        max: s.max,
        step: s.step,
        defaultValue: tuning[s.key],
        format: s.format,
      })),
    );
  }

  const disposers: Array<() => void> = [];

  const dirty = () => markPropLodGroupsDirty(ctx.propLodGroups);

  disposers.push(
    bindCheckbox(
      panel,
      'dev-prop-lod-enabled',
      () => getPropLodTuning().enabled,
      (on) => {
        setPropLodTuning({ enabled: on });
        dirty();
      },
    ),
  );

  disposers.push(
    bindCheckbox(panel, 'dev-prop-lod-color-debug', isPropLodDebugEnabled, setPropLodDebug),
  );

  for (const s of DIST_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        setPropLodTuning({ [s.key]: v });
        dirty();
      }),
    );
  }

  const resetBtn = panel.querySelector('#dev-prop-lod-reset') as HTMLButtonElement | null;
  const onReset = () => {
    resetPropLodTuning();
    dirty();
    const t = getPropLodTuning();
    const en = panel.querySelector('#dev-prop-lod-enabled') as HTMLInputElement | null;
    if (en) en.checked = t.enabled;
    const dbg = panel.querySelector('#dev-prop-lod-color-debug') as HTMLInputElement | null;
    if (dbg) dbg.checked = isPropLodDebugEnabled();
    for (const s of DIST_SPECS) {
      syncSlider(panel, s.id, `${s.id}-out`, t[s.key], s.format);
    }
  };
  resetBtn?.addEventListener('click', onReset);
  disposers.push(() => resetBtn?.removeEventListener('click', onReset));

  return () => {
    for (const d of disposers) d();
  };
}
