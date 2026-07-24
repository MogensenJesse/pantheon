// src/world/mapProps/config/propShadowKeys.ts — asset keys that cast shadows when map-instanced
import { ASSET_MANIFEST } from '../../../assets/assetManifest';
import { VISUAL } from '../../../config/visualTuning';

export const PROP_TREE_KEYS = new Set<string>([
  ...ASSET_MANIFEST.trees.map((t) => t.key),
  ...ASSET_MANIFEST.dead_trees.map((t) => t.key),
]);

export const PROP_ROCK_KEYS = new Set<string>([
  ...ASSET_MANIFEST.rocks.map((r) => r.key),
  ...ASSET_MANIFEST.rock_paths.map((r) => r.key),
]);

/** Bushes, ferns, clover, plants, flowers, mushrooms — alpha-cutout cards. */
export const PROP_FOLIAGE_KEYS = new Set<string>([
  ...ASSET_MANIFEST.plants.map((p) => p.key),
  ...ASSET_MANIFEST.flowers.map((p) => p.key),
  ...ASSET_MANIFEST.mushrooms.map((p) => p.key),
]);

export const PROP_PEBBLE_KEYS = new Set<string>(ASSET_MANIFEST.pebbles.map((p) => p.key));

/** Whether a map prop asset key should cast sun shadows when instanced. */
export function propCastsShadow(key: string): boolean {
  if (PROP_TREE_KEYS.has(key) || PROP_ROCK_KEYS.has(key)) return true;
  if (VISUAL.props.shadowCast.foliage && PROP_FOLIAGE_KEYS.has(key)) return true;
  if (VISUAL.props.shadowCast.pebbles && PROP_PEBBLE_KEYS.has(key)) return true;
  return false;
}
