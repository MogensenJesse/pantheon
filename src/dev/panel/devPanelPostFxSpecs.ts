// src/dev/panel/devPanelPostFxSpecs.ts — RangeSpec tables for the Post FX dev panel (stubs; stop editors live under Time of day)
import type { RangeSpec } from '../bindRange';

/** Grade stop look editors moved to Time of day — keep empty for Post FX enable-only section. */
export type GradeSpec = RangeSpec & {
  read?: (g: unknown) => number;
  write?: (g: unknown, v: number) => void;
};

export const GRADE_SPECS: GradeSpec[] = [];
