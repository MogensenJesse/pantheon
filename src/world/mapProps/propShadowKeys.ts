// src/world/mapProps/propShadowKeys.ts — asset keys that cast shadows when map-instanced
import { ASSET_MANIFEST } from '../../assets/assetManifest';

export const PROP_TREE_KEYS = new Set<string>([
  ...ASSET_MANIFEST.trees.map((t) => t.key),
  ...ASSET_MANIFEST.dead_trees.map((t) => t.key),
]);

export const PROP_ROCK_KEYS = new Set<string>([
  ...ASSET_MANIFEST.rocks.map((r) => r.key),
  ...ASSET_MANIFEST.rock_paths.map((r) => r.key),
]);
