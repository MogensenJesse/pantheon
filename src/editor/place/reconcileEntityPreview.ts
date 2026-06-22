// src/editor/place/reconcileEntityPreview.ts — diff entity snapshots for incremental preview sync
import type { MapEntity } from '../../map/MapTypes';
import type { StoredMapEntity } from '../core/EditorEntityStore';

export interface EntityPreviewDiff {
  removed: string[];
  added: string[];
  updated: string[];
}

function entityJson(entity: MapEntity): string {
  return JSON.stringify(entity);
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

  for (const { uid, entity } of next) {
    if (!prevUids.has(uid)) {
      added.push(uid);
      continue;
    }
    const prevEntity = prevByUid.get(uid);
    if (prevEntity && entityJson(prevEntity) !== entityJson(entity)) {
      updated.push(uid);
    }
  }

  return { removed, added, updated };
}

export function typedGridBuffersEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
