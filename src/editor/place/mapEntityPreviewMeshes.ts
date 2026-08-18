// src/editor/place/mapEntityPreviewMeshes.ts — clone/map entity meshes for editor picking
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type Scene,
  SphereGeometry,
} from 'three';
import { cloneFromRegistry } from '../../assets/AssetLoader';
import type { AssetRegistry } from '../../assets/assetManifest';
import type { MapEntity } from '../../map/MapTypes';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import {
  composePropWorldQuaternion,
  propAlignsToTerrainSlope,
} from '../../world/mapProps/mapPropTerrainAlign';
import type { EditorEntityStore } from '../core/EditorEntityStore';
import {
  alignObjectBaseToSurface,
  propSurfaceY,
  sampleEditorTerrainSurfaceNormal,
  sampleEditorTerrainSurfaceY,
} from '../core/editorTerrainSurface';
import { cacheEditorLocalAabb } from './editorLocalAabb';

const MARKER_COLORS: Record<string, number> = {
  playerStart: 0x44ff88,
  orb: 0xffc840,
};

export interface EntityPreviewMeshState {
  root: Group;
  rebuild: (
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    onEntityAdded: (uid: string, obj: Object3D) => void,
  ) => void;
  addEntities: (
    uids: readonly string[],
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    onEntityAdded: (uid: string, obj: Object3D) => void,
    lod?: 0 | 1 | 2,
  ) => void;
  removeEntities: (uids: readonly string[]) => void;
  applyEntityTransform: (
    uid: string,
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    onOutlinesDirty: (uid: string) => void,
  ) => void;
  getObjectRoot: (uid: string) => Object3D | null;
  findUidForObject: (obj: Object3D) => string | null;
  getPickables: () => Object3D[];
  dispose: () => void;
}

function disposePreviewObject(obj: Object3D): void {
  const mesh = obj as Mesh;
  // Registry prop clones share geom/mats with lod0 — detach only (caller already removed).
  if (!(mesh.isMesh && obj.userData.isEditorMarker)) return;
  mesh.geometry?.dispose();
  (mesh.material as MeshBasicMaterial)?.dispose();
}

function makeMarker(color: number, scale = 1.5): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(0.6 * scale, 12, 12),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
  );
  mesh.userData.isEditorMarker = true;
  return mesh;
}

/** Extra Y (at scale 1) so the AABB bottom sits on the surface — skip Box3 after first key. */
const originLiftAtScale1 = new Map<string, number>();

function applyPropPreviewTransform(
  obj: Object3D,
  entity: Extract<MapEntity, { type: 'prop' }>,
  terrain: MapTerrainContext,
): void {
  const surfaceY = propSurfaceY(terrain, entity.x, entity.z, entity.surfaceLift ?? 0);
  const alignToSlope = propAlignsToTerrainSlope(entity.key);
  obj.scale.setScalar(entity.scale);
  if (alignToSlope) {
    obj.position.set(entity.x, surfaceY, entity.z);
    const normal = sampleEditorTerrainSurfaceNormal(terrain, entity.x, entity.z);
    composePropWorldQuaternion(obj.quaternion, normal, entity.rotY, true);
    alignObjectBaseToSurface(obj, surfaceY);
    return;
  }

  obj.rotation.set(0, entity.rotY, 0);
  const cached = originLiftAtScale1.get(entity.key);
  if (cached !== undefined) {
    obj.position.set(entity.x, surfaceY + cached * entity.scale, entity.z);
    return;
  }

  obj.position.set(entity.x, surfaceY, entity.z);
  alignObjectBaseToSurface(obj, surfaceY);
  if (entity.scale !== 0) {
    originLiftAtScale1.set(entity.key, (obj.position.y - surfaceY) / entity.scale);
  }
}

function buildPreviewObject(
  entity: MapEntity,
  assets: AssetRegistry,
  terrain: MapTerrainContext,
  lod: 0 | 1 | 2 = 0,
): Object3D | null {
  if (entity.type === 'prop') {
    try {
      const obj = cloneFromRegistry(assets, entity.key, lod);
      applyPropPreviewTransform(obj, entity, terrain);
      return obj;
    } catch {
      const surfaceY = propSurfaceY(terrain, entity.x, entity.z, entity.surfaceLift ?? 0);
      const obj = new Mesh(
        new BoxGeometry(1, 2, 1),
        new MeshBasicMaterial({ color: 0x888888, wireframe: true }),
      );
      obj.position.set(entity.x, surfaceY + 1, entity.z);
      return obj;
    }
  }

  const y = sampleEditorTerrainSurfaceY(terrain, entity.x, entity.z);

  if (entity.type === 'playerStart') {
    const obj = makeMarker(MARKER_COLORS.playerStart, 1.2);
    obj.position.set(entity.x, y + 1.2, entity.z);
    return obj;
  }

  if (entity.type === 'orb') {
    const obj = makeMarker(MARKER_COLORS.orb, 0.9);
    obj.position.set(entity.x, y + 1.5, entity.z);
    return obj;
  }

  return null;
}

function tagEntityObject(
  uid: string,
  obj: Object3D,
  uidByObject: Map<Object3D, string>,
  objectByUid: Map<string, Object3D>,
): void {
  obj.userData.editorEntityUid = uid;
  uidByObject.set(obj, uid);
  objectByUid.set(uid, obj);
  obj.traverse((child) => {
    if (child !== obj) child.userData.editorEntityUid = uid;
  });
}

export function createEntityPreviewMeshes(
  scene: Scene,
  assets: AssetRegistry,
): EntityPreviewMeshState {
  const root = new Group();
  root.name = 'editorEntityPreviews';
  scene.add(root);

  const uidByObject = new Map<Object3D, string>();
  const objectByUid = new Map<string, Object3D>();
  let pickablesCache: Object3D[] | null = null;

  const clearPickablesCache = () => {
    pickablesCache = null;
  };

  const clearChildren = () => {
    while (root.children.length) {
      const child = root.children[0];
      root.remove(child);
      disposePreviewObject(child);
    }
    uidByObject.clear();
    objectByUid.clear();
    clearPickablesCache();
  };

  const addOneEntity = (
    uid: string,
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    onEntityAdded: (uid: string, obj: Object3D) => void,
    lod: 0 | 1 | 2 = 0,
  ): void => {
    if (objectByUid.has(uid)) return;
    const item = store.get(uid);
    if (!item) return;

    const obj = buildPreviewObject(item.entity, assets, terrain, lod);
    if (!obj) return;

    tagEntityObject(uid, obj, uidByObject, objectByUid);
    root.add(obj);
    cacheEditorLocalAabb(obj);
    onEntityAdded(uid, obj);
  };

  return {
    root,
    rebuild(store, terrain, onEntityAdded) {
      clearChildren();
      for (const { uid } of store.getAll()) {
        addOneEntity(uid, store, terrain, onEntityAdded);
      }
    },
    addEntities(uids, store, terrain, onEntityAdded, lod = 0) {
      for (const uid of uids) {
        addOneEntity(uid, store, terrain, onEntityAdded, lod);
      }
      clearPickablesCache();
    },
    removeEntities(uids) {
      for (const uid of uids) {
        const obj = objectByUid.get(uid);
        if (!obj) continue;
        objectByUid.delete(uid);
        uidByObject.delete(obj);
        root.remove(obj);
        disposePreviewObject(obj);
      }
      clearPickablesCache();
    },
    applyEntityTransform(uid, store, terrain, onOutlinesDirty) {
      const item = store.get(uid);
      const objectRoot = objectByUid.get(uid) ?? null;
      if (!item || !objectRoot) return;

      const entity = item.entity;

      if (entity.type === 'prop') {
        applyPropPreviewTransform(objectRoot, entity, terrain);
      } else {
        const y = sampleEditorTerrainSurfaceY(terrain, entity.x, entity.z);
        if (entity.type === 'playerStart') {
          objectRoot.position.set(entity.x, y + 1.2, entity.z);
        } else if (entity.type === 'orb') {
          objectRoot.position.set(entity.x, y + 1.5, entity.z);
        }
      }

      onOutlinesDirty(uid);
    },
    getObjectRoot(uid) {
      return objectByUid.get(uid) ?? null;
    },
    findUidForObject(obj) {
      let cur: Object3D | null = obj;
      while (cur) {
        const uid = cur.userData.editorEntityUid as string | undefined;
        if (uid) return uid;
        cur = cur.parent;
      }
      return null;
    },
    getPickables() {
      if (pickablesCache) return pickablesCache;
      const list: Object3D[] = [];
      root.traverse((o) => {
        if ((o as Mesh).isMesh) list.push(o);
      });
      pickablesCache = list;
      return list;
    },
    dispose() {
      clearChildren();
      scene.remove(root);
    },
  };
}
