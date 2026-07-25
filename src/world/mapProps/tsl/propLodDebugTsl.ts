// src/world/mapProps/tsl/propLodDebugTsl.ts — DEV false-color overlay for prop LOD bands
import { float, mix, step, vec3 } from 'three/tsl';
import { PROP_LOD_DEBUG_COLORS, uPropLodDebug } from '../config/propLodConfig';

type TslNode = any;

/** Replace shaded albedo with the LOD band color when `uPropLodDebug` is on. */
export function applyPropLodDebugColor(shadedColor: TslNode, lodBand: 0 | 1 | 2): TslNode {
  const c = PROP_LOD_DEBUG_COLORS[lodBand]!;
  const debugColor = vec3(c.r, c.g, c.b);
  const debugOn = step(float(0.5), uPropLodDebug);
  return mix(shadedColor, debugColor, debugOn);
}
