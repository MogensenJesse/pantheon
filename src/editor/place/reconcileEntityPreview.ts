// src/editor/place/reconcileEntityPreview.ts — diff entity snapshots for incremental preview sync

import type { MapEntity } from '../../map/MapTypes';
import type { StoredMapEntity } from '../core/EditorEntityStore';
import { entityJson } from '../core/EditorHistory';

export interface EntityPreviewDiff {
  removed: string[];
  added: string[];
  updated: string[];
  /** Same uid but prop key or entity type changed — remove mesh + re-clone. */
  replaced: string[];
}

function entityIdentityChanged(prev: MapEntity, next: MapEntity): boolean {
  if (prev.type !== next.type) return true;
  return prev.type === 'prop' && next.type === 'prop' && prev.key !== next.key;
}

export function diffEntitySnapshots(
  prev: readonly StoredMapEntity[],
  next: readonly StoredMapEntity[],
): EntityPreviewDiff {
  const prevUids = new Set(prev.map((entry) => entry.uid));
  const prevByUid = new Map(prev.map((entry) => [entry.uid, entry.entity]));
  const nextUids = new Set(next.map((entry) => entry.uid));

  const removed = [...prevUids].filter((uid) => !nextUids.has(uid));
  const added: string[] = [];
  const updated: string[] = [];
  const replaced: string[] = [];

  for (const { uid, entity } of next) {
    if (!prevUids.has(uid)) {
      added.push(uid);
      continue;
    }
    const prevEntity = prevByUid.get(uid);
    if (!prevEntity || entityJson(prevEntity) === entityJson(entity)) continue;
    if (entityIdentityChanged(prevEntity, entity)) replaced.push(uid);
    else updated.push(uid);
  }

  return { removed, added, updated, replaced };
}
