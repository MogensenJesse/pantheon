// src/rendering/postfx/dofReveal.ts — energy-driven DoF bokeh scale
import { MathUtils } from 'three';
import { VISUAL } from '../../config/visualTuning';

const { BOKEH_SCALE_START, BOKEH_SCALE_END } = VISUAL.dof;

/** Bokeh scale lerps start → end as energy rises (8 → 2 by default). */
export function dofBokehScaleFromReveal(energyRatio: number): number {
  const e = MathUtils.clamp(energyRatio, 0, 1);
  return BOKEH_SCALE_START + e * (BOKEH_SCALE_END - BOKEH_SCALE_START);
}
