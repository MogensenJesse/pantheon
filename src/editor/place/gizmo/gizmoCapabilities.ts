// src/editor/gizmo/gizmoCapabilities.ts — per-entity-type transform rules for the place gizmo
import type { MapEntity } from '../../../map/MapTypes';
import type { EditorEntityStore } from '../../core/EditorEntityStore';

export interface EntityDragSnapshot {
  x: number;
  z: number;
  rotY: number;
  scale: number;
  canRotate: boolean;
  canScale: boolean;
}

export function canMove(entity: MapEntity): boolean {
  return (
    entity.type === 'prop' ||
    entity.type === 'mountain' ||
    entity.type === 'standingStone' ||
    entity.type === 'playerStart' ||
    entity.type === 'orb' ||
    entity.type === 'landmark'
  );
}

export function canRotate(entity: MapEntity): boolean {
  return entity.type === 'prop' || entity.type === 'mountain' || entity.type === 'standingStone';
}

export function canScale(entity: MapEntity): boolean {
  return entity.type === 'prop' || entity.type === 'mountain' || entity.type === 'standingStone';
}

export function readRotY(entity: MapEntity): number {
  if (entity.type === 'prop' || entity.type === 'mountain' || entity.type === 'standingStone') {
    return entity.rotY ?? 0;
  }
  return 0;
}

export function readScale(entity: MapEntity): number {
  if (entity.type === 'prop' || entity.type === 'mountain') return entity.scale;
  if (entity.type === 'standingStone') return entity.scale ?? 1;
  return 1;
}

export function groupTransformFlags(
  selectedUids: readonly string[],
  store: EditorEntityStore,
): { anyMove: boolean; anyRotate: boolean; anyScale: boolean } {
  let anyMove = false;
  let anyRotate = false;
  let anyScale = false;
  for (const uid of selectedUids) {
    const ent = store.get(uid)?.entity;
    if (!ent) continue;
    if (canMove(ent)) anyMove = true;
    if (canRotate(ent)) anyRotate = true;
    if (canScale(ent)) anyScale = true;
  }
  return { anyMove, anyRotate, anyScale };
}

export function buildDragSnapshots(
  selectedUids: readonly string[],
  store: EditorEntityStore,
): {
  snapshots: Map<string, EntityDragSnapshot>;
  groupCenterX: number;
  groupCenterZ: number;
} {
  const snapshots = new Map<string, EntityDragSnapshot>();
  let groupCenterX = 0;
  let groupCenterZ = 0;
  let count = 0;

  for (const uid of selectedUids) {
    const item = store.get(uid);
    if (!item || !canMove(item.entity)) continue;
    const ent = item.entity;
    snapshots.set(uid, {
      x: ent.x,
      z: ent.z,
      rotY: readRotY(ent),
      scale: readScale(ent),
      canRotate: canRotate(ent),
      canScale: canScale(ent),
    });
    groupCenterX += ent.x;
    groupCenterZ += ent.z;
    count++;
  }

  if (count > 0) {
    groupCenterX /= count;
    groupCenterZ /= count;
  }

  return { snapshots, groupCenterX, groupCenterZ };
}
