// src/editor/EntityTransformGizmo.ts — move / rotate / scale handles for one or many entities
import {
  Box3,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  type PerspectiveCamera,
  Plane,
  Raycaster,
  type Scene,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { MapEntity } from '../map/MapTypes';
import type { EditorEntityStore } from './EditorEntityStore';
import { blockEntityPointer, blockTerrainPointer } from './EditorInput';
import type { MapEntityPreviewContext } from './MapEntityPreview';

export type GizmoMode = 'move' | 'rotate' | 'scale';

export interface EntityTransformGizmoHandlers {
  /** `rebuild: false` after gizmo drag — preview meshes already updated in place. */
  onChanged: (opts?: { rebuild?: boolean }) => void;
}

export interface EntityTransformGizmoContext {
  setSelectedUids: (uids: readonly string[]) => void;
  setEnabled: (enabled: boolean) => void;
  update: () => void;
  rebindTerrainMesh: (mesh: Object3D) => void;
  dispose: () => void;
}

const HANDLE_RADIUS = 0.42;
const MOVE_COLOR = 0x44ccff;
const ROTATE_COLOR = 0xffaa44;
const SCALE_COLOR = 0x66ff88;

const _up = new Vector3(0, 1, 0);
const _dragPlane = new Plane();
const _planeHit = new Vector3();
const _rotateOrigin = new Vector3();
const _groupBox = new Box3();

interface EntityDragSnapshot {
  x: number;
  z: number;
  rotY: number;
  scale: number;
  canRotate: boolean;
  canScale: boolean;
}

function gizmoDebugEnabled(): boolean {
  return import.meta.env.DEV && localStorage.getItem('pantheon.editorGizmoDebug') === '1';
}

function gizmoLog(...args: unknown[]): void {
  if (gizmoDebugEnabled()) console.log('[editor-gizmo]', ...args);
}

function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function canMove(entity: MapEntity): boolean {
  return (
    entity.type === 'prop' ||
    entity.type === 'mountain' ||
    entity.type === 'standingStone' ||
    entity.type === 'playerStart' ||
    entity.type === 'orb' ||
    entity.type === 'landmark'
  );
}

function canRotate(entity: MapEntity): boolean {
  return entity.type === 'prop' || entity.type === 'mountain' || entity.type === 'standingStone';
}

function canScale(entity: MapEntity): boolean {
  return entity.type === 'prop' || entity.type === 'mountain' || entity.type === 'standingStone';
}

function readRotY(entity: MapEntity): number {
  if (entity.type === 'prop' || entity.type === 'mountain' || entity.type === 'standingStone') {
    return entity.rotY ?? 0;
  }
  return 0;
}

function readScale(entity: MapEntity): number {
  if (entity.type === 'prop' || entity.type === 'mountain') return entity.scale;
  if (entity.type === 'standingStone') return entity.scale ?? 1;
  return 1;
}

function makeHandle(mode: GizmoMode, color: number): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(HANDLE_RADIUS, 12, 12),
    new MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  mesh.renderOrder = 999;
  mesh.userData.editorGizmo = mode;
  return mesh;
}

export function createEntityTransformGizmo(
  scene: Scene,
  camera: PerspectiveCamera,
  domElement: HTMLElement,
  terrainMesh: Object3D,
  store: EditorEntityStore,
  getPreview: () => MapEntityPreviewContext,
  handlers: EntityTransformGizmoHandlers,
): EntityTransformGizmoContext {
  let terrainTarget = terrainMesh;
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const center = new Vector3();
  const size = new Vector3();

  const root = new Object3D();
  root.name = 'editorTransformGizmo';
  scene.add(root);

  const moveHandle = makeHandle('move', MOVE_COLOR);
  const rotateHandle = makeHandle('rotate', ROTATE_COLOR);
  const scaleHandle = makeHandle('scale', SCALE_COLOR);
  root.add(moveHandle, rotateHandle, scaleHandle);

  let enabled = true;
  const selectedUids: string[] = [];
  let dragMode: GizmoMode | null = null;
  let dragPointerId = -1;
  let dragDirty = false;

  let startClientY = 0;
  let startHitX = 0;
  let startHitZ = 0;
  let startAngle = 0;
  let groupCenterX = 0;
  let groupCenterZ = 0;
  let rotatePlaneY = 0;
  let rotateOriginX = 0;
  let rotateOriginZ = 0;

  const dragSnapshots = new Map<string, EntityDragSnapshot>();

  const pickables = () => [moveHandle, rotateHandle, scaleHandle].filter((h) => h.visible);

  const setNdc = (clientX: number, clientY: number) => {
    const rect = domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  };

  const raycastTerrain = (clientX: number, clientY: number): { x: number; z: number } | null => {
    setNdc(clientX, clientY);
    const hits = raycaster.intersectObject(terrainTarget, false);
    if (!hits.length) return null;
    return { x: hits[0].point.x, z: hits[0].point.z };
  };

  const pickGizmo = (clientX: number, clientY: number): GizmoMode | null => {
    setNdc(clientX, clientY);
    const hits = raycaster.intersectObjects(pickables(), true);
    if (!hits.length) return null;
    return hits[0].object.userData.editorGizmo as GizmoMode;
  };

  const pointerAngleY = (clientX: number, clientY: number): number | null => {
    setNdc(clientX, clientY);
    _rotateOrigin.set(rotateOriginX, rotatePlaneY, rotateOriginZ);
    _dragPlane.setFromNormalAndCoplanarPoint(_up, _rotateOrigin);
    const hit = raycaster.ray.intersectPlane(_dragPlane, _planeHit);
    if (!hit) return null;
    return Math.atan2(_planeHit.x - rotateOriginX, _planeHit.z - rotateOriginZ);
  };

  const groupFlags = () => {
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
  };

  const syncHandleLayout = () => {
    root.visible = false;
    if (!enabled || selectedUids.length === 0) return;

    _groupBox.makeEmpty();
    for (const uid of selectedUids) {
      const objRoot = getPreview().getObjectRoot(uid);
      if (objRoot) _groupBox.expandByObject(objRoot);
    }
    if (_groupBox.isEmpty()) return;

    const { anyMove, anyRotate, anyScale } = groupFlags();
    if (!anyMove) return;

    _groupBox.getCenter(center);
    _groupBox.getSize(size);
    const halfY = size.y * 0.5;

    root.position.copy(center);
    root.visible = true;

    moveHandle.visible = true;
    moveHandle.position.set(0, halfY + 0.45, 0);

    rotateHandle.visible = anyRotate || selectedUids.length > 1;
    rotateHandle.position.set(size.x * 0.5 + 0.55, 0.25, 0);

    scaleHandle.visible = anyScale;
    scaleHandle.position.set(0, halfY + 0.45, size.z * 0.5 + 0.45);
  };

  const buildDragSnapshots = () => {
    dragSnapshots.clear();
    groupCenterX = 0;
    groupCenterZ = 0;
    let count = 0;

    for (const uid of selectedUids) {
      const item = store.get(uid);
      if (!item || !canMove(item.entity)) continue;
      const ent = item.entity;
      dragSnapshots.set(uid, {
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
  };

  const commitPreview = () => {
    const preview = getPreview();
    for (const uid of selectedUids) preview.applyEntityTransform(uid);
    syncHandleLayout();
  };

  const applyDrag = (clientX: number, clientY: number) => {
    if (!dragMode || dragSnapshots.size === 0) return;

    if (dragMode === 'move') {
      const hit = raycastTerrain(clientX, clientY);
      if (!hit) return;
      const dx = hit.x - startHitX;
      const dz = hit.z - startHitZ;
      for (const [uid, snap] of dragSnapshots) {
        store.update(uid, { x: snap.x + dx, z: snap.z + dz });
      }
      dragDirty = true;
      commitPreview();
      return;
    }

    if (dragMode === 'rotate') {
      const angle = pointerAngleY(clientX, clientY);
      if (angle == null) return;
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
      dragDirty = true;
      commitPreview();
      return;
    }

    if (dragMode === 'scale') {
      const dy = startClientY - clientY;
      const factor = Math.max(0.15, 1 + dy * 0.006);

      for (const [uid, snap] of dragSnapshots) {
        const dx = snap.x - groupCenterX;
        const dz = snap.z - groupCenterZ;
        const patch: { x: number; z: number; scale?: number } = {
          x: groupCenterX + dx * factor,
          z: groupCenterZ + dz * factor,
        };
        if (snap.canScale) {
          const item = store.get(uid);
          const minScale = item?.entity.type === 'standingStone' ? 0.2 : 0.15;
          patch.scale = Math.max(minScale, snap.scale * factor);
        }
        store.update(uid, patch);
      }
      dragDirty = true;
      commitPreview();
    }
  };

  const endDrag = () => {
    if (dragMode)
      gizmoLog('endDrag', { mode: dragMode, dirty: dragDirty, count: selectedUids.length });
    const shouldSync = dragDirty;
    dragMode = null;
    dragPointerId = -1;
    dragDirty = false;
    dragSnapshots.clear();
    domElement.style.cursor = '';
    if (shouldSync) handlers.onChanged({ rebuild: false });
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled || e.button !== 0 || selectedUids.length === 0) return;
    const mode = pickGizmo(e.clientX, e.clientY);
    if (!mode) return;

    const { anyMove, anyRotate, anyScale } = groupFlags();
    if (mode === 'move' && !anyMove) return;
    if (mode === 'rotate' && !anyRotate && selectedUids.length === 1) return;
    if (mode === 'scale' && !anyScale) return;

    gizmoLog('pointerdown', { mode, count: selectedUids.length });

    blockTerrainPointer();
    blockEntityPointer();
    e.preventDefault();
    e.stopPropagation();

    buildDragSnapshots();
    if (dragSnapshots.size === 0) return;

    dragMode = mode;
    dragPointerId = e.pointerId;
    dragDirty = false;
    startClientY = e.clientY;
    domElement.setPointerCapture(e.pointerId);

    rotateOriginX = groupCenterX;
    rotateOriginZ = groupCenterZ;
    rotatePlaneY = root.position.y;

    if (mode === 'move') {
      const hit = raycastTerrain(e.clientX, e.clientY);
      startHitX = hit?.x ?? groupCenterX;
      startHitZ = hit?.z ?? groupCenterZ;
    } else if (mode === 'rotate') {
      startAngle = pointerAngleY(e.clientX, e.clientY) ?? 0;
    }

    domElement.style.cursor = mode === 'move' ? 'move' : mode === 'rotate' ? 'grab' : 'ns-resize';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (dragMode && e.pointerId === dragPointerId) {
      applyDrag(e.clientX, e.clientY);
      return;
    }
    if (!enabled || selectedUids.length === 0 || dragMode) return;
    const mode = pickGizmo(e.clientX, e.clientY);
    domElement.style.cursor =
      mode === 'move' ? 'move' : mode === 'rotate' ? 'grab' : mode === 'scale' ? 'ns-resize' : '';
  };

  const onPointerUp = (e: PointerEvent) => {
    if (dragPointerId < 0 || e.pointerId !== dragPointerId) return;
    try {
      domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* released */
    }
    endDrag();
  };

  domElement.addEventListener('pointerdown', onPointerDown, true);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);

  return {
    setSelectedUids: (uids) => {
      const changed =
        uids.length !== selectedUids.length || uids.some((uid, i) => uid !== selectedUids[i]);
      if (changed && dragMode) endDrag();
      selectedUids.length = 0;
      selectedUids.push(...uids);
      syncHandleLayout();
      gizmoLog('setSelectedUids', uids);
    },
    setEnabled: (on) => {
      enabled = on;
      if (!on) endDrag();
      syncHandleLayout();
    },
    update: syncHandleLayout,
    rebindTerrainMesh: (mesh) => {
      terrainTarget = mesh;
    },
    dispose: () => {
      domElement.removeEventListener('pointerdown', onPointerDown, true);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('pointercancel', onPointerUp);
      scene.remove(root);
      moveHandle.geometry.dispose();
      rotateHandle.geometry.dispose();
      scaleHandle.geometry.dispose();
      (moveHandle.material as MeshBasicMaterial).dispose();
      (rotateHandle.material as MeshBasicMaterial).dispose();
      (scaleHandle.material as MeshBasicMaterial).dispose();
    },
  };
}
