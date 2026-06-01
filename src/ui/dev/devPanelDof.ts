// src/ui/dev/devPanelDof.ts — DEV depth of field (PostFX)
import { VISUAL } from '../../config/visualTuning';
import type { DofParams, PostFXContext } from '../../rendering/PostFX';
import { bindRange, mountSection, type RangeSpec, syncSpecs } from './bindRange';

const D = VISUAL.dof;

interface DofSpec extends RangeSpec {
  key: keyof DofParams;
}

const DOF_SPECS: DofSpec[] = [
  {
    id: 'dev-dof-focus-offset',
    label: 'Focus offset',
    min: -3,
    max: 3,
    step: 0.05,
    defaultValue: D.FOCUS_DISTANCE_OFFSET,
    format: (v) => v.toFixed(2),
    key: 'focusDistanceOffset',
  },
  {
    id: 'dev-dof-focal-length',
    label: 'Focal length',
    min: 1,
    max: 135,
    step: 0.5,
    defaultValue: D.FOCAL_LENGTH,
    format: (v) => v.toFixed(1),
    key: 'focalLength',
  },
  {
    id: 'dev-dof-focus-smooth',
    label: 'Focus smooth',
    min: 1,
    max: 24,
    step: 0.5,
    defaultValue: D.FOCUS_SMOOTH,
    format: (v) => v.toFixed(1),
    key: 'focusSmooth',
  },
];

function bindDofSpecs(panel: HTMLDivElement, postFX: PostFXContext): Array<() => void> {
  const disposers: Array<() => void> = [];
  for (const s of DOF_SPECS) {
    disposers.push(
      bindRange(panel, s.id, `${s.id}-out`, s.format, (v) => {
        postFX.setDofParams({ [s.key]: v } as Partial<DofParams>);
      }),
    );
  }
  return disposers;
}

export function initDevPanelDof(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const rows = DOF_SPECS.map(
    (s) => `
      <label class="dev-row">
        <span>${s.label}</span>
        <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.defaultValue}" />
        <output id="${s.id}-out">${s.format(s.defaultValue)}</output>
      </label>`,
  ).join('');

  const body = mountSection(panel, {
    hostId: 'dev-section-dof',
    title: 'Depth of field',
    open: false,
    body: `
      <p class="dev-hint">Always on. Bokeh scales with energy: ${D.BOKEH_SCALE_START} at 0% → ${D.BOKEH_SCALE_END} at 100%. Disable via Render debug.</p>
      ${rows}
      <div class="dev-actions">
        <button type="button" id="dev-dof-reset">Reset DoF</button>
      </div>
    `,
  });
  if (!body) return () => {};

  syncSpecs(panel, DOF_SPECS, (s) => postFX.getDofParams()[(s as DofSpec).key] as number);

  const disposers = bindDofSpecs(panel, postFX);

  const resetBtn = panel.querySelector('#dev-dof-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetDofParams();
    syncSpecs(panel, DOF_SPECS, (s) => postFX.getDofParams()[(s as DofSpec).key] as number);
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
