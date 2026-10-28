// src/dev/panel/devPanelDof.ts — DEV depth of field (PostFX)
import { VISUAL } from '../../config/visualTuning';
import type { DofParams, PostFXContext } from '../../rendering/PostFX';
import { bindSpecs, injectRangeRows, mountSection, syncSpecs } from '../bindRange';
import { DOF_SPECS, type DofSpec } from './devPanelDofSpecs';

const D = VISUAL.dof;

function readDofParam(postFX: PostFXContext, s: DofSpec): number {
  return postFX.getDofParams()[s.key] as number;
}

export function initDevPanelDof(panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-dof',
    title: 'Depth of field',
    open: false,
    body: `
      <p class="dev-hint">Always on. Bokeh scales with energy: ${D.BOKEH_SCALE_START} at 0% → ${D.BOKEH_SCALE_END} at 100%. Disable via the Perf panel.</p>
      <div id="dev-dof-rows"></div>
      <div class="dev-actions">
        <button type="button" id="dev-dof-reset">Reset DoF</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const rowsHost = panel.querySelector('#dev-dof-rows');
  if (rowsHost) injectRangeRows(rowsHost, DOF_SPECS);

  syncSpecs(panel, DOF_SPECS, (s) => readDofParam(postFX, s));

  const disposers = bindSpecs(panel, DOF_SPECS, (s, v) => {
    postFX.setDofParams({ [s.key]: v } as Partial<DofParams>);
  });

  const resetBtn = panel.querySelector('#dev-dof-reset') as HTMLButtonElement | null;
  const onReset = () => {
    postFX.resetDofParams();
    syncSpecs(panel, DOF_SPECS, (s) => readDofParam(postFX, s));
  };
  resetBtn?.addEventListener('click', onReset);

  return () => {
    for (const fn of disposers) fn();
    resetBtn?.removeEventListener('click', onReset);
  };
}
