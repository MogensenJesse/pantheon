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
import type { EditorEntityStore } from '../core/EditorEntityStore';
import {
  alignObjectBaseToSurface,
  propSurfaceY,
  sampleEditorTerrainSurfaceY,
} from '../core/editorTerrainSurface';

const MARKER_COLORS: Record<string, number> = {
  playerStart: 0x44ff88,
  orb: 0xffc840,
};

export interface EntityPreviewMeshState {
  root: Group;
  uidByObject: Map<Object3D, string>;
  rebuild: (
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    onEntityAdded: (uid: string, obj: Object3D) => void,
  ) => void;
  applyEntityTransform: (
    uid: string,
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    onOutlinesDirty: (uid: string) => void,
  ) => void;
  getObjectRoot: (uid: string) => Object3D | null;
  findUidForObject: (obj: Object3D) => string | null;
  getPickables: () => Object3D[];
  clearPickablesCache: () => void;
}

function makeMarker(color: number, scale = 1.5): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(0.6 * scale, 12, 12),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
  );
  mesh.userData.isEditorMarker = true;
  return mesh;
}

function buildPreviewObject(
  entity: MapEntity,
  assets: AssetRegistry,
  terrain: MapTerrainContext,
): Object3D | null {
  if (entity.type === 'prop') {
    const surfaceY = propSurfaceY(terrain, entity.x, entity.z, entity.surfaceLift ?? 0);
    try {
      const model = cloneFromRegistry(assets, entity.key);
      const obj = model.clone(true);
      obj.position.set(entity.x, surfaceY, entity.z);
      obj.rotation.y = entity.rotY;
      obj.scale.setScalar(entity.scale);
      alignObjectBaseToSurface(obj, surfaceY);
      return obj;
    } catch {
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

function tagEntityObject(uid: string, obj: Object3D, uidByObject: Map<Object3D, string>): void {
  obj.userData.editorEntityUid = uid;
  uidByObject.set(obj, uid);
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
  let pickablesCache: Object3D[] | null = null;

  const clearChildren = () => {
    while (root.children.length) {
      const child = root.children[0];
      root.remove(child);
      child.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && m.userData.isEditorMarker) {
          m.geometry?.dispose();
          (m.material as MeshBasicMaterial)?.dispose();
        }
      });
    }
    uidByObject.clear();
    pickablesCache = null;
  };

  return {
    root,
    uidByObject,
    rebuild(store, terrain, onEntityAdded) {
      clearChildren();
      for (const { uid, entity } of store.getAll()) {
        const obj = buildPreviewObject(entity, assets, terrain);
        if (!obj) continue;
        tagEntityObject(uid, obj, uidByObject);
        root.add(obj);
        onEntityAdded(uid, obj);
      }
    },
    applyEntityTransform(uid, store, terrain, onOutlinesDirty) {
      const item = store.get(uid);
      let objectRoot: Object3D | null = null;
      for (const [o, id] of uidByObject) {
        if (id === uid) {
          objectRoot = o;
          break;
        }
      }
      if (!item || !objectRoot) return;

      const entity = item.entity;

      if (entity.type === 'prop') {
        const surfaceY = propSurfaceY(terrain, entity.x, entity.z, entity.surfaceLift ?? 0);
        objectRoot.position.set(entity.x, surfaceY, entity.z);
        objectRoot.rotation.y = entity.rotY;
        objectRoot.scale.setScalar(entity.scale);
        alignObjectBaseToSurface(objectRoot, surfaceY);
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
      for (const [obj, id] of uidByObject) {
        if (id === uid) return obj;
      }
      return null;
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
    clearPickablesCache() {
      pickablesCache = null;
    },
  };
}
