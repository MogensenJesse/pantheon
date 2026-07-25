// src/world/mapProps/config/propLodConfig.ts — live prop LOD distance tuning
import { Color } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';

export type PropLodTuning = {
  enabled: boolean;
  nearMaxM: number;
  midMaxM: number;
  farMaxM: number;
  rebinThresholdM: number;
};

const defaults = VISUAL.props.lod;

const live: PropLodTuning = {
  enabled: defaults.enabled,
  nearMaxM: defaults.nearMaxM,
  midMaxM: defaults.midMaxM,
  farMaxM: defaults.farMaxM,
  rebinThresholdM: defaults.rebinThresholdM,
};

/** DEV: 1 = replace prop albedo with per-LOD false colors. */
export const uPropLodDebug = uniform(0);

/** Distinct false-colors for lod0 / lod1 / lod2 (near / mid / far). */
export const PROP_LOD_DEBUG_COLORS = [
  new Color('#22dd44'), // lod0 near — green
  new Color('#22aaff'), // lod1 mid — blue
  new Color('#ff44aa'), // lod2 far — magenta
] as const;

export function getPropLodTuning(): Readonly<PropLodTuning> {
  return live;
}

export function setPropLodTuning(partial: Partial<PropLodTuning>): void {
  Object.assign(live, partial);
}

export function setPropLodDebug(enabled: boolean): void {
  uPropLodDebug.value = enabled ? 1 : 0;
}

export function isPropLodDebugEnabled(): boolean {
  return Number(uPropLodDebug.value) > 0.5;
}

export function resetPropLodTuning(): void {
  live.enabled = defaults.enabled;
  live.nearMaxM = defaults.nearMaxM;
  live.midMaxM = defaults.midMaxM;
  live.farMaxM = defaults.farMaxM;
  live.rebinThresholdM = defaults.rebinThresholdM;
  uPropLodDebug.value = 0;
}
