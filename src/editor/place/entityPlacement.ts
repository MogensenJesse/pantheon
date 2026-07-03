// src/editor/place/entityPlacement.ts — place authored entities from palette ids

import type { MapEntity } from '../../map/MapTypes';
import { getPaletteEntry } from '../../map/mapEntityCatalog';
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

/** Spawn a palette entity at world (x, z). Returns null for unknown ids or playerStart. */
export function createPropAt(placeId: string, x: number, z: number): MapEntity | null {
  const entry = getPaletteEntry(placeId);
  if (!entry || entry.placeId === 'playerStart') return null;

  const entity = entry.entityFactory(x, z);
  if (entity.type === 'prop') return applyPropPlaceOptions(entity);
  return entity;
}

export interface PlaceEntityResult {
  uid: string;
  /** False when an existing entity (e.g. player start) was moved in place. */
  created: boolean;
}

export function placeEntityAt(
  store: EditorEntityStore,
  placeId: string,
  x: number,
  z: number,
): PlaceEntityResult | null {
  const entry = getPaletteEntry(placeId);
  if (!entry) return null;

  if (entry.placeId === 'playerStart') {
    const existing = store.getAll().find((item) => item.entity.type === 'playerStart');
    if (existing) {
      store.update(existing.uid, { x, z });
      return { uid: existing.uid, created: false };
    }
    return { uid: store.add(entry.entityFactory(x, z)), created: true };
  }

  const entity = createPropAt(placeId, x, z);
  if (!entity) return null;
  return { uid: store.add(entity), created: true };
}
