// src/rendering/postfx/dofParams.ts — depth-of-field tunables for PostFX pipeline
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

/** Dev-tunable DoF (defaults in visualTuning.ts). */
export interface DofParams {
  enabled: boolean;
  focusDistanceOffset: number;
  focalLength: number;
  focusSmooth: number;
}

export interface DofUniforms {
  uFocusDistance: ReturnType<typeof uniform>;
  uFocalLength: ReturnType<typeof uniform>;
  uBokehScale: ReturnType<typeof uniform>;
}

export function defaultDofParams(): DofParams {
  const d = VISUAL.dof;
  return {
    enabled: d.ENABLED,
    focusDistanceOffset: d.FOCUS_DISTANCE_OFFSET,
    focalLength: d.FOCAL_LENGTH,
    focusSmooth: d.FOCUS_SMOOTH,
  };
}

export function createDofUniforms(params: DofParams): DofUniforms {
  return {
    uFocusDistance: uniform(params.focusDistanceOffset + 6),
    uFocalLength: uniform(params.focalLength),
    uBokehScale: uniform(VISUAL.dof.BOKEH_SCALE_START),
  };
}

export function applyDofTunables(params: DofParams, uniforms: DofUniforms): void {
  uniforms.uFocalLength.value = params.focalLength;
}
