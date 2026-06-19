// src/editor/place/entityPlacement.ts — place authored entities from palette ids

import { getPaletteEntry } from '../../map/mapEntityCatalog';
import type { MapEntity } from '../../map/MapTypes';
import type { EditorEntityStore } from '../core/EditorEntityStore';
import { getPlaceOptions } from './placeOptions';

function applyPropPlaceOptions(entity: MapEntity): MapEntity {
  if (entity.type !== 'prop') return entity;

  const opts = getPlaceOptions();
  const result = { ...entity };

  if (opts.randomRotation) {
    result.rotY = Math.random() * Math.PI * 2;
  }

  if (opts.randomScale) {
    const lo = Math.min(opts.scaleMinMul, opts.scaleMaxMul);
    const hi = Math.max(opts.scaleMinMul, opts.scaleMaxMul);
    const mult = lo + Math.random() * (hi - lo);
    result.scale = entity.scale * mult;
  }

  return result;
}

export function placeEntityAt(
  store: EditorEntityStore,
  placeId: string,
  x: number,
  z: number,
): boolean {
  const entry = getPaletteEntry(placeId);
  if (!entry) return false;

  if (entry.placeId === 'playerStart') {
    const existing = store.getAll().find((item) => item.entity.type === 'playerStart');
    if (existing) {
      store.update(existing.uid, { x, z });
    } else {
      store.add(entry.entityFactory(x, z));
    }
    return true;
  }

  store.add(applyPropPlaceOptions(entry.entityFactory(x, z)));
  return true;
}
