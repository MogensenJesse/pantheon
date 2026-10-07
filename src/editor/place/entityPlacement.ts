// src/editor/place/entityPlacement.ts — place authored entities from palette ids

import { getPaletteEntry } from '../../map/authoring/mapEntityCatalog';
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

/** Palette markers that exist once per map: placing again moves the existing one. */
const SINGLETON_MARKER_TYPES = ['playerStart', 'villageSeed'] as const;

function isSingletonMarker(placeId: string): placeId is (typeof SINGLETON_MARKER_TYPES)[number] {
  return (SINGLETON_MARKER_TYPES as readonly string[]).includes(placeId);
}

/** Spawn a palette entity at world (x, z). Returns null for unknown ids and singleton markers. */
export function createPropAt(placeId: string, x: number, z: number): MapEntity | null {
  const entry = getPaletteEntry(placeId);
  if (!entry || isSingletonMarker(entry.placeId)) return null;

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

  if (isSingletonMarker(entry.placeId)) {
    const existing = store.getAll().find((item) => item.entity.type === entry.placeId);
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
