// src/ui/dev/devPanelDofSpecs.ts — RangeSpec tables for the Depth of field dev panel
import { VISUAL } from '../../config/visualTuning';
import type { DofParams } from '../../rendering/PostFX';
import type { RangeSpec } from './bindRange';

const D = VISUAL.dof;

export interface DofSpec extends RangeSpec {
  key: keyof DofParams;
}

export const DOF_SPECS: DofSpec[] = [
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
