// src/editor/place/EntityTransformGizmo.ts — move / rotate / scale handles for one or many entities
import {
  type Object3D,
  type PerspectiveCamera,
  Plane,
  Raycaster,
  type Scene,
  Vector3,
} from 'three';
import type { EditorEntityStore } from '../core/EditorEntityStore';
import type { EditorHistoryRecorder, EditorSnapshot } from '../core/EditorHistory';
import type { EditorPointerRouter } from '../core/EditorPointerRouter';
import { clientToNdc, raycastTerrain as raycastTerrainHit } from '../core/raycast';
import {
  buildDragSnapshots,
  type EntityDragSnapshot,
  groupTransformFlags,
} from './gizmo/gizmoCapabilities';
import { applyGizmoDrag } from './gizmo/gizmoDrag';
import { createGizmoHandleSet, type GizmoMode, syncGizmoHandleLayout } from './gizmo/gizmoHandles';
import type { MapEntityPreviewContext } from './MapEntityPreview';

export type { GizmoMode } from './gizmo/gizmoHandles';

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

const _up = new Vector3(0, 1, 0);
const _dragPlane = new Plane();
const _planeHit = new Vector3();
const _rotateOrigin = new Vector3();

function gizmoDebugEnabled(): boolean {
  return import.meta.env.DEV && localStorage.getItem('pantheon.editorGizmoDebug') === '1';
}

function gizmoLog(...args: unknown[]): void {
  if (gizmoDebugEnabled()) console.log('[editor-gizmo]', ...args);
}

export function createEntityTransformGizmo(
  scene: Scene,
  camera: PerspectiveCamera,
  domElement: HTMLElement,
  terrainMesh: Object3D,
  store: EditorEntityStore,
  getPreview: () => MapEntityPreviewContext,
  handlers: EntityTransformGizmoHandlers,
  history?: EditorHistoryRecorder,
  pointerRouter?: EditorPointerRouter,
): EntityTransformGizmoContext {
  let terrainTarget = terrainMesh;
  const raycaster = new Raycaster();
  const handles = createGizmoHandleSet(scene);

  let enabled = true;
  const selectedUids: string[] = [];
  let dragMode: GizmoMode | null = null;
  let dragPointerId = -1;
  let dragDirty = false;
  let gestureBefore: EditorSnapshot | null = null;

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

  const setNdc = (clientX: number, clientY: number) => {
    raycaster.setFromCamera(clientToNdc(domElement, clientX, clientY), camera);
  };

  const raycastTerrain = (clientX: number, clientY: number): { x: number; z: number } | null => {
    const hit = raycastTerrainHit(raycaster, camera, terrainTarget, domElement, clientX, clientY);
    if (!hit) return null;
    return { x: hit.x, z: hit.z };
  };

  const pickGizmo = (clientX: number, clientY: number): GizmoMode | null => {
    setNdc(clientX, clientY);
    const hits = raycaster.intersectObjects(handles.pickables(), true);
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

  const syncHandleLayout = () => {
    syncGizmoHandleLayout({
      handles,
      enabled,
      selectedUids,
      getObjectRoot: (uid) => getPreview().getObjectRoot(uid),
      store,
    });
  };

  const commitPreview = () => {
    const preview = getPreview();
    for (const uid of selectedUids) preview.applyEntityTransform(uid);
    syncHandleLayout();
  };

  const endDrag = () => {
    if (dragMode)
      gizmoLog('endDrag', { mode: dragMode, dirty: dragDirty, count: selectedUids.length });
    const shouldSync = dragDirty;
    const before = gestureBefore;
    dragMode = null;
    dragPointerId = -1;
    dragDirty = false;
    gestureBefore = null;
    dragSnapshots.clear();
    domElement.style.cursor = '';
    if (shouldSync) {
      if (before && history) history.commitGesture(before);
      handlers.onChanged({ rebuild: false });
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled || e.button !== 0 || selectedUids.length === 0) return;
    const mode = pickGizmo(e.clientX, e.clientY);
    if (!mode) return;

    const { anyMove, anyRotate, anyScale } = groupTransformFlags(selectedUids, store);
    if (mode === 'move' && !anyMove) return;
    if (mode === 'rotate' && !anyRotate && selectedUids.length === 1) return;
    if (mode === 'scale' && !anyScale) return;

    gizmoLog('pointerdown', { mode, count: selectedUids.length });

    pointerRouter?.blockTerrainPointer();
    pointerRouter?.blockEntityPointer();
    e.preventDefault();
    e.stopPropagation();

    const built = buildDragSnapshots(selectedUids, store);
    dragSnapshots.clear();
    for (const [uid, snap] of built.snapshots) dragSnapshots.set(uid, snap);
    groupCenterX = built.groupCenterX;
    groupCenterZ = built.groupCenterZ;
    if (dragSnapshots.size === 0) return;

    gestureBefore = history?.beginGesture() ?? null;
    dragMode = mode;
    dragPointerId = e.pointerId;
    dragDirty = false;
    startClientY = e.clientY;
    domElement.setPointerCapture(e.pointerId);

    rotateOriginX = groupCenterX;
    rotateOriginZ = groupCenterZ;
    rotatePlaneY = handles.root.position.y;

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
      if (
        applyGizmoDrag({
          mode: dragMode,
          clientX: e.clientX,
          clientY: e.clientY,
          startClientY,
          startHitX,
          startHitZ,
          startAngle,
          groupCenterX,
          groupCenterZ,
          dragSnapshots,
          store,
          raycastTerrain,
          pointerAngleY,
        })
      ) {
        dragDirty = true;
        commitPreview();
      }
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
      handles.dispose();
    },
  };
}
