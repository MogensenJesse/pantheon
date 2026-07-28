// src/world/mapProps/config/propReflectionKeys.ts — asset keys drawn into the water reflector
import { VISUAL } from '../../../config/visualTuning';
import { PROP_ROCK_KEYS, PROP_TREE_KEYS } from './propShadowKeys';

/**
 * Whether a map prop asset key should render in the planar water reflector.
 *
 * Reflected props cost a second instanced draw, so `large` limits the pass to trees and
 * rocks — the silhouettes actually readable at reflector resolution. Deliberately keyed on
 * asset family rather than {@link propCastsShadow} so shadow tuning cannot shift reflections.
 */
export function propReflectsInWater(key: string): boolean {
  const mode = VISUAL.water.reflectProps;
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return PROP_TREE_KEYS.has(key) || PROP_ROCK_KEYS.has(key);
}
