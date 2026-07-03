// src/editor/place/gizmo/gizmoHandles.ts — gizmo handle meshes and layout
import {
  Box3,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { groupTransformFlags } from './gizmoCapabilities';

export type GizmoMode = 'move' | 'rotate' | 'scale';

const HANDLE_RADIUS = 0.42;
const MOVE_COLOR = 0x44ccff;
const ROTATE_COLOR = 0xffaa44;
const SCALE_COLOR = 0x66ff88;

const _groupBox = new Box3();
const _center = new Vector3();
const _size = new Vector3();

export interface GizmoHandleSet {
  root: Object3D;
  moveHandle: Mesh;
  rotateHandle: Mesh;
  scaleHandle: Mesh;
  pickables: () => Mesh[];
  dispose: () => void;
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

export function createGizmoHandleSet(scene: Scene): GizmoHandleSet {
  const root = new Object3D();
  root.name = 'editorTransformGizmo';
  scene.add(root);

  const moveHandle = makeHandle('move', MOVE_COLOR);
  const rotateHandle = makeHandle('rotate', ROTATE_COLOR);
  const scaleHandle = makeHandle('scale', SCALE_COLOR);
  root.add(moveHandle, rotateHandle, scaleHandle);

  return {
    root,
    moveHandle,
    rotateHandle,
    scaleHandle,
    pickables: () => [moveHandle, rotateHandle, scaleHandle].filter((h) => h.visible),
    dispose: () => {
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

export interface SyncGizmoLayoutParams {
  handles: GizmoHandleSet;
  enabled: boolean;
  selectedUids: readonly string[];
  getObjectRoot: (uid: string) => Object3D | null;
  store: import('../../core/EditorEntityStore').EditorEntityStore;
}

export function syncGizmoHandleLayout(params: SyncGizmoLayoutParams): void {
  const { handles, enabled, selectedUids, getObjectRoot, store } = params;
  const { root, moveHandle, rotateHandle, scaleHandle } = handles;

  root.visible = false;
  if (!enabled || selectedUids.length === 0) return;

  _groupBox.makeEmpty();
  for (const uid of selectedUids) {
    const objRoot = getObjectRoot(uid);
    if (objRoot) _groupBox.expandByObject(objRoot);
  }
  if (_groupBox.isEmpty()) return;

  const { anyMove, anyRotate, anyScale } = groupTransformFlags(selectedUids, store);
  if (!anyMove) return;

  _groupBox.getCenter(_center);
  _groupBox.getSize(_size);
  const halfY = _size.y * 0.5;

  root.position.copy(_center);
  root.visible = true;

  moveHandle.visible = true;
  moveHandle.position.set(0, halfY + 0.45, 0);

  rotateHandle.visible = anyRotate || selectedUids.length > 1;
  rotateHandle.position.set(_size.x * 0.5 + 0.55, 0.25, 0);

  scaleHandle.visible = anyScale;
  scaleHandle.position.set(0, halfY + 0.45, _size.z * 0.5 + 0.45);
}
