// src/editor/place/mapEntityPreviewMeshes.ts — instanced lod2 previews + marker clones
import {
  Box3,
  BoxGeometry,
  type Camera,
  ConeGeometry,
  Group,
  InstancedMesh,
  type Intersection,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Ray,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { cloneFromRegistry } from '../../assets/AssetLoader';
import type { AssetRegistry } from '../../assets/assetManifest';
import { PHASE0 } from '../../config/phase0';
import type { MapEntity } from '../../map/MapTypes';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import { extractMeshes } from '../../world/mapProps/mapPropInstancing';
import type { MapPropPlacement } from '../../world/mapProps/mapPropPlacement';
import { propAlignsToTerrainSlope } from '../../world/mapProps/mapPropTerrainAlign';
import {
  computeModelFootLocal,
  resolvePropInstanceMatrix,
} from '../../world/mapProps/resolvePropInstanceMatrix';
import type { PropTerrainSurface } from '../../world/terrain/cpu/terrainSurfaceCpu';
import type { EditorEntityStore } from '../core/EditorEntityStore';
import {
  createEditorPropTerrainSurface,
  sampleEditorTerrainSurfaceY,
} from '../core/editorTerrainSurface';
import { getObjectScreenRect, getWorldAabbScreenRect, type ScreenRect } from './EditorScreenRect';
import { cacheEditorLocalAabb } from './editorLocalAabb';
import { EDITOR_PROP_PREVIEW_LOD } from './editorPropPreviewLod';

const MARKER_COLORS: Record<string, number> = {
  playerStart: 0x44ff88,
  orb: 0xffc840,
};

const DEFAULT_PLAYER_START_ROT_Y = PHASE0.CAMERA.INITIAL_YAW;
const INITIAL_CAPACITY = 64;
const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);

const _matrix = new Matrix4();
const _box = new Box3();
const _hitPoint = new Vector3();
const _ray = new Ray();

function playerStartRotY(entity: Extract<MapEntity, { type: 'playerStart' }>): number {
  return entity.rotY ?? DEFAULT_PLAYER_START_ROT_Y;
}

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
  ) => void;
  removeEntities: (uids: readonly string[]) => void;
  applyEntityTransform: (
    uid: string,
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    onOutlinesDirty: (uid: string) => void,
  ) => void;
  refreshSurfaceHeights: (
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    uids: readonly string[],
    onOutlinesDirty: (uid: string) => void,
  ) => void;
  setPromoted: (
    uids: ReadonlySet<string>,
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    assets: AssetRegistry,
  ) => void;
  getObjectRoot: (uid: string) => Object3D | null;
  promote: (
    uid: string,
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    assets: AssetRegistry,
  ) => Object3D | null;
  findUidForObject: (obj: Object3D) => string | null;
  findUidForHit: (hit: Intersection) => string | null;
  pickUid: (ray: Ray) => string | null;
  getScreenRect: (uid: string, camera: Camera, canvasRect: DOMRect) => ScreenRect | null;
  getPickables: () => Object3D[];
  dispose: () => void;
}

interface PropSlot {
  key: string;
  index: number;
}

interface PropBucket {
  key: string;
  meshes: InstancedMesh[];
  uids: string[];
  count: number;
  capacity: number;
  localAabb: Box3;
  footLocal: Vector3;
  alignToSlope: boolean;
  dirty: boolean;
  ownedGeometry: boolean;
}

function disposePreviewObject(obj: Object3D): void {
  if (!obj.userData.isEditorMarker) return;
  obj.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mat = mesh.material as { dispose?: () => void };
    mat.dispose?.();
  });
}

function makeMarker(color: number, scale = 1.5): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(0.6 * scale, 12, 12),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
  );
  mesh.userData.isEditorMarker = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function makePlayerStartMarker(): Group {
  const root = new Group();
  root.userData.isEditorMarker = true;

  const body = new Mesh(
    new SphereGeometry(0.72, 12, 12),
    new MeshBasicMaterial({
      color: MARKER_COLORS.playerStart,
      transparent: true,
      opacity: 0.85,
    }),
  );
  const nose = new Mesh(
    new ConeGeometry(0.28, 1.1, 8),
    new MeshBasicMaterial({ color: 0xa8ffcc, transparent: true, opacity: 0.95 }),
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.15;
  root.add(body, nose);
  return root;
}

function applyPlayerStartTransform(
  obj: Object3D,
  entity: Extract<MapEntity, { type: 'playerStart' }>,
  terrain: MapTerrainContext,
): void {
  const y = sampleEditorTerrainSurfaceY(terrain, entity.x, entity.z);
  obj.position.set(entity.x, y + 1.2, entity.z);
  obj.rotation.set(0, playerStartRotY(entity), 0);
}

function cloneEditorMaterial(src: Material): Material {
  const cloned = src.clone();
  (cloned as Material & { fog?: boolean }).fog = false;
  return cloned;
}

function configureInstancedMesh(mesh: InstancedMesh, key: string): void {
  mesh.name = `editorPropInstances:${key}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.raycast = () => {};
  mesh.userData.editorPropKey = key;
  mesh.count = 0;
  mesh.visible = false;
}

function copyInstanceRange(src: InstancedMesh, dst: InstancedMesh, count: number): void {
  const floats = count * 16;
  dst.instanceMatrix.array.set(src.instanceMatrix.array.subarray(0, floats));
  dst.instanceMatrix.needsUpdate = true;
}

function entityToPlacement(entity: Extract<MapEntity, { type: 'prop' }>): MapPropPlacement {
  return {
    x: entity.x,
    z: entity.z,
    yRotation: entity.rotY,
    scale: entity.scale,
    surfaceLift: entity.surfaceLift ?? 0,
  };
}

export function createEntityPreviewMeshes(
  scene: Scene,
  assets: AssetRegistry,
): EntityPreviewMeshState {
  const root = new Group();
  root.name = 'editorEntityPreviews';
  scene.add(root);

  const uidByObject = new Map<Object3D, string>();
  const markerByUid = new Map<string, Object3D>();
  const buckets = new Map<string, PropBucket>();
  const slotByUid = new Map<string, PropSlot>();
  const promoted = new Map<string, Object3D>();
  let pickablesCache: Object3D[] | null = null;

  const clearPickablesCache = () => {
    pickablesCache = null;
  };

  const tagMarker = (uid: string, obj: Object3D) => {
    obj.userData.editorEntityUid = uid;
    uidByObject.set(obj, uid);
    markerByUid.set(uid, obj);
    obj.traverse((child) => {
      if (child !== obj) child.userData.editorEntityUid = uid;
    });
  };

  const disposeBucket = (bucket: PropBucket) => {
    for (const mesh of bucket.meshes) {
      root.remove(mesh);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) mat.dispose();
      if (bucket.ownedGeometry) mesh.geometry.dispose();
    }
  };

  const flushBucket = (bucket: PropBucket) => {
    if (!bucket.dirty) return;
    for (const mesh of bucket.meshes) {
      mesh.count = bucket.count;
      mesh.visible = bucket.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    bucket.dirty = false;
  };

  const flushAllBuckets = () => {
    for (const bucket of buckets.values()) flushBucket(bucket);
  };

  const writeMatrix = (bucket: PropBucket, index: number, matrix: Matrix4) => {
    for (const mesh of bucket.meshes) mesh.setMatrixAt(index, matrix);
    bucket.dirty = true;
  };

  const growBucket = (bucket: PropBucket, needed: number) => {
    if (needed <= bucket.capacity) return;
    let cap = bucket.capacity;
    while (cap < needed) cap *= 2;
    const grown: InstancedMesh[] = [];
    for (const old of bucket.meshes) {
      const inst = new InstancedMesh(old.geometry, old.material, cap);
      configureInstancedMesh(inst, bucket.key);
      copyInstanceRange(old, inst, bucket.count);
      inst.count = bucket.count;
      inst.visible = bucket.count > 0;
      root.add(inst);
      root.remove(old);
      old.instanceMatrix.dispose();
      grown.push(inst);
    }
    bucket.meshes = grown;
    bucket.capacity = cap;
    bucket.dirty = true;
  };

  const createBucket = (key: string): PropBucket => {
    const asset = assets.get(key);
    const lodRoot = asset?.lod2 ?? asset?.lod0 ?? null;
    const alignToSlope = propAlignsToTerrainSlope(key);
    const localAabb = new Box3();
    const footLocal = new Vector3();
    let meshes: InstancedMesh[];
    let ownedGeometry = false;

    if (lodRoot) {
      computeModelFootLocal(lodRoot, footLocal);
      localAabb.setFromObject(lodRoot);
      try {
        const srcMeshes = extractMeshes(lodRoot);
        meshes = srcMeshes.map((src) => {
          const srcMat = Array.isArray(src.material) ? src.material[0]! : src.material;
          const inst = new InstancedMesh(
            src.geometry,
            cloneEditorMaterial(srcMat),
            INITIAL_CAPACITY,
          );
          configureInstancedMesh(inst, key);
          return inst;
        });
      } catch {
        ownedGeometry = true;
        const geom = new BoxGeometry(1, 2, 1);
        const mat = new MeshBasicMaterial({ color: 0x888888, wireframe: true });
        const inst = new InstancedMesh(geom, mat, INITIAL_CAPACITY);
        configureInstancedMesh(inst, key);
        meshes = [inst];
        localAabb.setFromCenterAndSize(new Vector3(0, 1, 0), new Vector3(1, 2, 1));
      }
    } else {
      ownedGeometry = true;
      const geom = new BoxGeometry(1, 2, 1);
      const mat = new MeshBasicMaterial({ color: 0x888888, wireframe: true });
      const inst = new InstancedMesh(geom, mat, INITIAL_CAPACITY);
      configureInstancedMesh(inst, key);
      meshes = [inst];
      localAabb.setFromCenterAndSize(new Vector3(0, 1, 0), new Vector3(1, 2, 1));
    }

    for (const mesh of meshes) root.add(mesh);
    const bucket: PropBucket = {
      key,
      meshes,
      uids: [],
      count: 0,
      capacity: INITIAL_CAPACITY,
      localAabb,
      footLocal: footLocal.clone(),
      alignToSlope,
      dirty: true,
      ownedGeometry,
    };
    buckets.set(key, bucket);
    return bucket;
  };

  const getBucket = (key: string): PropBucket => buckets.get(key) ?? createBucket(key);

  const writeEntityMatrix = (
    bucket: PropBucket,
    index: number,
    entity: Extract<MapEntity, { type: 'prop' }>,
    surface: PropTerrainSurface,
    hidden: boolean,
  ) => {
    if (hidden) {
      writeMatrix(bucket, index, HIDDEN_MATRIX);
      return;
    }
    resolvePropInstanceMatrix(
      entityToPlacement(entity),
      surface,
      bucket.alignToSlope,
      bucket.footLocal,
      _matrix,
    );
    writeMatrix(bucket, index, _matrix);
  };

  const addPropInstance = (
    uid: string,
    entity: Extract<MapEntity, { type: 'prop' }>,
    surface: PropTerrainSurface,
  ) => {
    if (slotByUid.has(uid)) return;
    const bucket = getBucket(entity.key);
    growBucket(bucket, bucket.count + 1);
    const index = bucket.count;
    bucket.count += 1;
    bucket.uids[index] = uid;
    slotByUid.set(uid, { key: entity.key, index });
    writeEntityMatrix(bucket, index, entity, surface, false);
  };

  const demoteUid = (uid: string, store: EditorEntityStore, terrain: MapTerrainContext) => {
    const clone = promoted.get(uid);
    if (!clone) return;
    root.remove(clone);
    promoted.delete(uid);
    uidByObject.delete(clone);
    const slot = slotByUid.get(uid);
    const item = store.get(uid);
    if (!slot || item?.entity.type !== 'prop') return;
    const bucket = buckets.get(slot.key);
    if (!bucket) return;
    writeEntityMatrix(
      bucket,
      slot.index,
      item.entity,
      createEditorPropTerrainSurface(terrain),
      false,
    );
  };

  const promoteUid = (
    uid: string,
    store: EditorEntityStore,
    terrain: MapTerrainContext,
    registry: AssetRegistry,
  ): Object3D | null => {
    const existing = promoted.get(uid) ?? markerByUid.get(uid) ?? null;
    if (existing) return existing;
    const item = store.get(uid);
    if (item?.entity.type !== 'prop') return markerByUid.get(uid) ?? null;
    const slot = slotByUid.get(uid);
    const bucket = slot ? buckets.get(slot.key) : undefined;
    if (!slot || !bucket) return null;

    let obj: Object3D;
    try {
      obj = cloneFromRegistry(registry, item.entity.key, EDITOR_PROP_PREVIEW_LOD);
    } catch {
      obj = new Mesh(
        new BoxGeometry(1, 2, 1),
        new MeshBasicMaterial({ color: 0x888888, wireframe: true }),
      );
    }
    obj.matrixAutoUpdate = false;
    const surface = createEditorPropTerrainSurface(terrain);
    writeEntityMatrix(bucket, slot.index, item.entity, surface, true);
    resolvePropInstanceMatrix(
      entityToPlacement(item.entity),
      surface,
      bucket.alignToSlope,
      bucket.footLocal,
      _matrix,
    );
    obj.matrix.copy(_matrix);
    obj.matrixWorldNeedsUpdate = true;
    obj.userData.editorEntityUid = uid;
    obj.traverse((child) => {
      child.userData.editorEntityUid = uid;
      child.castShadow = false;
      child.receiveShadow = false;
    });
    root.add(obj);
    cacheEditorLocalAabb(obj);
    promoted.set(uid, obj);
    uidByObject.set(obj, uid);
    clearPickablesCache();
    return obj;
  };

  const removePropSlot = (uid: string) => {
    const clone = promoted.get(uid);
    if (clone) {
      root.remove(clone);
      promoted.delete(uid);
      uidByObject.delete(clone);
    }
    const slot = slotByUid.get(uid);
    if (!slot) return;
    const bucket = buckets.get(slot.key);
    slotByUid.delete(uid);
    if (!bucket) return;
    const last = bucket.count - 1;
    if (last < 0) return;
    if (slot.index !== last) {
      const lastUid = bucket.uids[last]!;
      for (const mesh of bucket.meshes) {
        mesh.getMatrixAt(last, _matrix);
        mesh.setMatrixAt(slot.index, _matrix);
      }
      bucket.uids[slot.index] = lastUid;
      const lastSlot = slotByUid.get(lastUid);
      if (lastSlot) lastSlot.index = slot.index;
    }
    bucket.count -= 1;
    bucket.dirty = true;
  };

  const addMarkerEntity = (
    uid: string,
    entity: MapEntity,
    terrain: MapTerrainContext,
    onEntityAdded: (uid: string, obj: Object3D) => void,
  ) => {
    if (markerByUid.has(uid)) return;
    let obj: Object3D | null = null;
    if (entity.type === 'playerStart') {
      obj = makePlayerStartMarker();
      applyPlayerStartTransform(obj, entity, terrain);
    } else if (entity.type === 'orb') {
      const y = sampleEditorTerrainSurfaceY(terrain, entity.x, entity.z);
      obj = makeMarker(MARKER_COLORS.orb, 0.9);
      obj.position.set(entity.x, y + 1.5, entity.z);
    }
    if (!obj) return;
    tagMarker(uid, obj);
    root.add(obj);
    cacheEditorLocalAabb(obj);
    onEntityAdded(uid, obj);
  };

  const clearAll = () => {
    for (const bucket of buckets.values()) disposeBucket(bucket);
    buckets.clear();
    slotByUid.clear();
    for (const clone of promoted.values()) root.remove(clone);
    promoted.clear();
    for (const obj of markerByUid.values()) {
      root.remove(obj);
      disposePreviewObject(obj);
      uidByObject.delete(obj);
    }
    markerByUid.clear();
    uidByObject.clear();
    clearPickablesCache();
  };

  const instanceWorldBox = (bucket: PropBucket, index: number, target: Box3): boolean => {
    bucket.meshes[0]?.getMatrixAt(index, _matrix);
    if (_matrix.elements[0] === 0 && _matrix.elements[5] === 0 && _matrix.elements[10] === 0) {
      return false;
    }
    target.copy(bucket.localAabb).applyMatrix4(_matrix);
    return !target.isEmpty();
  };

  return {
    root,
    rebuild(store, terrain, onEntityAdded) {
      clearAll();
      const surface = createEditorPropTerrainSurface(terrain);
      for (const { uid, entity } of store.getAll()) {
        if (entity.type === 'prop') addPropInstance(uid, entity, surface);
        else addMarkerEntity(uid, entity, terrain, onEntityAdded);
      }
      flushAllBuckets();
    },
    addEntities(uids, store, terrain, onEntityAdded) {
      const surface = createEditorPropTerrainSurface(terrain);
      for (const uid of uids) {
        const item = store.get(uid);
        if (!item) continue;
        if (item.entity.type === 'prop') addPropInstance(uid, item.entity, surface);
        else addMarkerEntity(uid, item.entity, terrain, onEntityAdded);
      }
      flushAllBuckets();
      clearPickablesCache();
    },
    removeEntities(uids) {
      for (const uid of uids) {
        const marker = markerByUid.get(uid);
        if (marker) {
          markerByUid.delete(uid);
          uidByObject.delete(marker);
          root.remove(marker);
          disposePreviewObject(marker);
          continue;
        }
        removePropSlot(uid);
      }
      flushAllBuckets();
      clearPickablesCache();
    },
    applyEntityTransform(uid, store, terrain, onOutlinesDirty) {
      const item = store.get(uid);
      if (!item) return;
      const entity = item.entity;
      const marker = markerByUid.get(uid);
      if (marker) {
        if (entity.type === 'playerStart') applyPlayerStartTransform(marker, entity, terrain);
        else if (entity.type === 'orb') {
          const y = sampleEditorTerrainSurfaceY(terrain, entity.x, entity.z);
          marker.position.set(entity.x, y + 1.5, entity.z);
        }
        onOutlinesDirty(uid);
        return;
      }
      if (entity.type !== 'prop') return;
      const slot = slotByUid.get(uid);
      const bucket = slot ? buckets.get(slot.key) : undefined;
      if (!slot || !bucket) return;
      const hero = promoted.get(uid);
      const surface = createEditorPropTerrainSurface(terrain);
      writeEntityMatrix(bucket, slot.index, entity, surface, Boolean(hero));
      if (hero) {
        resolvePropInstanceMatrix(
          entityToPlacement(entity),
          surface,
          bucket.alignToSlope,
          bucket.footLocal,
          _matrix,
        );
        hero.matrix.copy(_matrix);
        hero.matrixWorldNeedsUpdate = true;
      }
      flushBucket(bucket);
      onOutlinesDirty(uid);
    },
    refreshSurfaceHeights(store, terrain, uids, onOutlinesDirty) {
      for (const uid of uids) {
        this.applyEntityTransform(uid, store, terrain, onOutlinesDirty);
      }
    },
    setPromoted(uids, store, terrain, registry) {
      for (const uid of [...promoted.keys()]) {
        if (!uids.has(uid)) demoteUid(uid, store, terrain);
      }
      for (const uid of uids) {
        if (markerByUid.has(uid) || promoted.has(uid)) continue;
        promoteUid(uid, store, terrain, registry);
      }
      flushAllBuckets();
      clearPickablesCache();
    },
    getObjectRoot(uid) {
      return promoted.get(uid) ?? markerByUid.get(uid) ?? null;
    },
    promote(uid, store, terrain, registry) {
      const obj = promoteUid(uid, store, terrain, registry);
      flushAllBuckets();
      return obj;
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
    findUidForHit(hit) {
      const key = hit.object.userData.editorPropKey as string | undefined;
      if (key !== undefined && hit.instanceId !== undefined) {
        const bucket = buckets.get(key);
        const uid = bucket?.uids[hit.instanceId];
        if (uid && !promoted.has(uid)) return uid;
      }
      return this.findUidForObject(hit.object);
    },
    pickUid(ray) {
      _ray.copy(ray);
      let bestUid: string | null = null;
      let bestDist = Infinity;

      const considerPoint = (uid: string, point: Vector3) => {
        const dist = point.distanceToSquared(_ray.origin);
        if (dist < bestDist) {
          bestDist = dist;
          bestUid = uid;
        }
      };

      for (const [uid, obj] of markerByUid) {
        _box.setFromObject(obj);
        if (_box.isEmpty()) continue;
        const hit = _ray.intersectBox(_box, _hitPoint);
        if (hit) considerPoint(uid, hit);
      }
      for (const [uid, obj] of promoted) {
        _box.setFromObject(obj);
        if (_box.isEmpty()) continue;
        const hit = _ray.intersectBox(_box, _hitPoint);
        if (hit) considerPoint(uid, hit);
      }
      for (const bucket of buckets.values()) {
        for (let i = 0; i < bucket.count; i++) {
          const uid = bucket.uids[i];
          if (!uid || promoted.has(uid)) continue;
          if (!instanceWorldBox(bucket, i, _box)) continue;
          const hit = _ray.intersectBox(_box, _hitPoint);
          if (hit) considerPoint(uid, hit);
        }
      }

      return bestUid;
    },
    getScreenRect(uid, camera, canvasRect) {
      const obj = promoted.get(uid) ?? markerByUid.get(uid);
      if (obj) return getObjectScreenRect(obj, camera, canvasRect);
      const slot = slotByUid.get(uid);
      const bucket = slot ? buckets.get(slot.key) : undefined;
      if (!slot || !bucket) return null;
      if (!instanceWorldBox(bucket, slot.index, _box)) return null;
      return getWorldAabbScreenRect(_box, camera, canvasRect);
    },
    getPickables() {
      if (pickablesCache) return pickablesCache;
      const list: Object3D[] = [];
      for (const obj of markerByUid.values()) list.push(obj);
      for (const obj of promoted.values()) list.push(obj);
      pickablesCache = list;
      return list;
    },
    dispose() {
      clearAll();
      scene.remove(root);
    },
  };
}
