// src/editor/entityPlacement.ts — place authored entities from palette ids
import type { EditorEntityStore } from './EditorEntityStore';
import { getPaletteEntry } from '../map/mapEntityCatalog';

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

  store.add(entry.entityFactory(x, z));
  return true;
}
