// src/world/mapProps/sway/treeSwayProfile.ts — which loaded props sway, and how tall they are
import { Box3, type Object3D } from 'three';
import { PROP_TREE_KEYS } from '../config/propShadowKeys';
import { swayForKey, type TreeSway } from './treeSway';

const _bounds = new Box3();

/**
 * The sway of a map prop, or null when it is not a tree. The height comes from the lod0 model's bounds, and every
 * distance band uses it, so a tree's lean is the same whichever band it is drawn in.
 */
export function treeSwayFor(key: string, lod0: Object3D): TreeSway | null {
  if (!PROP_TREE_KEYS.has(key)) return null;
  _bounds.setFromObject(lod0);
  if (_bounds.isEmpty()) return null;
  return swayForKey(key, _bounds.max.y - _bounds.min.y, _bounds.min.y);
}
