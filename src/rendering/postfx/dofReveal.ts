// src/rendering/postfx/dofReveal.ts — energy-driven DoF bokeh (stronger at night)
import { VISUAL } from '../../config/visualTuning';

const { BOKEH_SCALE_START, BOKEH_SCALE_END } = VISUAL.dof;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Bokeh scale lerps start → end as energy rises (8 → 3 by default). */
export function dofBokehScaleFromReveal(energyRatio: number): number {
  const e = clamp01(energyRatio);
  return BOKEH_SCALE_START + e * (BOKEH_SCALE_END - BOKEH_SCALE_START);
}
