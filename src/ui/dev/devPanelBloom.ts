// src/ui/dev/devPanelBloom.ts — DEV-only glow/bloom controls (split from PostFx)
import { PHASE0 } from '../../config/phase0';
import type { BloomParams, PostFXContext } from '../../rendering/PostFX';
import { bindRange, injectRangeRows, mountSection, syncSpecs, type RangeSpec } from './bindRange';

const { BLOOM } = PHASE0;

const BLOOM_SPECS: RangeSpec[] = [
  {
    id: 'dev-bloom-strength',
    label: 'Strength',
    min: 0,
    max: 3,
    step: 0.05,
    defaultValue: BLOOM.STRENGTH,
    format: (n) => n.toFixed(2),
  },
  {
    id: 'dev-bloom-radius',
    label: 'Radius',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: BLOOM.RADIUS,
    format: (n) => n.toFixed(2),
  },
  {
    id: 'dev-bloom-scene-mul',
    label: 'Scene mix',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: BLOOM.SCENE_STRENGTH_MUL,
    format: (n) => n.toFixed(2),
  },
];

const BLOOM_PARAM_KEYS: Record<string, keyof BloomParams> = {
  'dev-bloom-strength': 'emissiveStrength',
  'dev-bloom-radius': 'radius',
  'dev-bloom-scene-mul': 'sceneStrengthMul',
};

export function initDevPanelBloom(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-glow-bloom',
    title: 'Glow &amp; bloom',
    open: false,
    body: `
      <div id="dev-bloom-rows"></div>
      <p class="dev-hint">Exposure is unified (AgX) — also in Sky &amp; atmosphere during reveal.</p>
      <div class="dev-actions">
        <button type="button" id="dev-bloom-reset">Reset glow</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const rowHost = panel.querySelector('#dev-bloom-rows');
  if (rowHost) injectRangeRows(rowHost, BLOOM_SPECS);

  const syncBloomUi = (params: BloomParams) => {
    syncSpecs(panel, BLOOM_SPECS, (s) => params[BLOOM_PARAM_KEYS[s.id]]);
  };

  const applyBloomPartial = (partial: Partial<BloomParams>) => {
    postFX.setBloomParams(partial);
    syncBloomUi(postFX.getBloomParams());
  };

  const disposers: Array<() => void> = [];
  for (const spec of BLOOM_SPECS) {
    const key = BLOOM_PARAM_KEYS[spec.id];
    disposers.push(
      bindRange(panel, spec.id, `${spec.id}-out`, spec.format, (v) =>
        applyBloomPartial({ [key]: v } as Partial<BloomParams>),
      ),
    );
  }

  const resetBtn = panel.querySelector('#dev-bloom-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetBloomParams();
    syncBloomUi(postFX.getBloomParams());
  };
  resetBtn?.addEventListener('click', onReset);

  syncBloomUi(postFX.getBloomParams());

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
