// src/editor/place/editorLocalAabb.ts — cached object-space AABB for editor picking/outlines
import { Box3, Matrix4, type Object3D } from 'three';

const LOCAL_AABB_KEY = 'editorLocalAabb';

const _world = new Box3();
const _inv = new Matrix4();

export function cacheEditorLocalAabb(obj: Object3D): void {
  obj.updateWorldMatrix(true, true);
  _world.setFromObject(obj);
  if (_world.isEmpty()) {
    obj.userData[LOCAL_AABB_KEY] = null;
    return;
  }
  obj.userData[LOCAL_AABB_KEY] = _world.clone().applyMatrix4(_inv.copy(obj.matrixWorld).invert());
}

export function getEditorLocalAabb(obj: Object3D): Box3 | null {
  const cached = obj.userData[LOCAL_AABB_KEY] as Box3 | null | undefined;
  if (cached) return cached;
  cacheEditorLocalAabb(obj);
  return (obj.userData[LOCAL_AABB_KEY] as Box3 | null | undefined) ?? null;
}

/** World AABB from the cached local box (no mesh walk). Falls back to setFromObject. */
export function getEditorWorldAabb(obj: Object3D, target: Box3): boolean {
  const local = getEditorLocalAabb(obj);
  if (!local || local.isEmpty()) {
    target.setFromObject(obj);
    return !target.isEmpty();
  }
  obj.updateWorldMatrix(true, false);
  target.copy(local).applyMatrix4(obj.matrixWorld);
  return true;
}
