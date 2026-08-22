// src/editor/place/gizmo/gizmoDrag.ts — move / rotate / scale drag solvers

import type { EditorEntityStore } from '../../core/EditorEntityStore';
import type { EntityDragSnapshot } from './gizmoCapabilities';
import type { GizmoMode } from './gizmoHandles';

function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface ApplyGizmoDragParams {
  mode: GizmoMode;
  clientX: number;
  clientY: number;
  startClientY: number;
  startHitX: number;
  startHitZ: number;
  startAngle: number;
  groupCenterX: number;
  groupCenterZ: number;
  dragSnapshots: ReadonlyMap<string, EntityDragSnapshot>;
  store: EditorEntityStore;
  pickTerrainXZ: (clientX: number, clientY: number) => { x: number; z: number } | null;
  pointerAngleY: (clientX: number, clientY: number) => number | null;
}

export function applyGizmoDrag(params: ApplyGizmoDragParams): boolean {
  const {
    mode,
    clientX,
    clientY,
    startClientY,
    startHitX,
    startHitZ,
    startAngle,
    groupCenterX,
    groupCenterZ,
    dragSnapshots,
    store,
    pickTerrainXZ,
    pointerAngleY,
  } = params;

  if (dragSnapshots.size === 0) return false;

  if (mode === 'move') {
    const hit = pickTerrainXZ(clientX, clientY);
    if (!hit) return false;
    const dx = hit.x - startHitX;
    const dz = hit.z - startHitZ;
    for (const [uid, snap] of dragSnapshots) {
      store.update(uid, { x: snap.x + dx, z: snap.z + dz });
    }
    return true;
  }

  if (mode === 'rotate') {
    const angle = pointerAngleY(clientX, clientY);
    if (angle == null) return false;
    const delta = shortestAngleDelta(startAngle, angle);
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);

    for (const [uid, snap] of dragSnapshots) {
      const dx = snap.x - groupCenterX;
      const dz = snap.z - groupCenterZ;
      const patch: { x: number; z: number; rotY?: number } = {
        x: groupCenterX + dx * cos - dz * sin,
        z: groupCenterZ + dx * sin + dz * cos,
      };
      if (snap.canRotate) patch.rotY = snap.rotY + delta;
      store.update(uid, patch);
    }
    return true;
  }

  if (mode === 'scale') {
    const dy = startClientY - clientY;
    const factor = Math.max(0.15, 1 + dy * 0.006);
    const minScale = 0.15;

    for (const [uid, snap] of dragSnapshots) {
      if (!snap.canScale) continue;
      store.update(uid, {
        scale: Math.max(minScale, snap.scale * factor),
      });
    }
    return true;
  }

  return false;
}
