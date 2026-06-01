// src/editor/MapEntityPreview.ts — non-instanced preview clones for picking + selection outlines
import {
  BoxGeometry,
  BoxHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Scene,
  SphereGeometry,
} from 'three';
import { cloneFromRegistry } from '../assets/AssetLoader';
import type { AssetRegistry } from '../assets/assetManifest';
import type { MapEntity } from '../map/MapTypes';
import { STONE_SCALES } from '../world/LandmarkSpawner';
import type { TerrainContext } from '../world/TerrainGenerator';
import type { EditorEntityStore } from './EditorEntityStore';

const MARKER_COLORS: Record<string, number> = {
  playerStart: 0x44ff88,
  orb: 0xffc840,
  standingStone: 0xc8b8a0,
  landmark: 0x88aaff,
};

const HOVER_OUTLINE = 0x6a9fd8;
const SELECT_OUTLINE = 0xd4b8ff;
const SELECT_GLOW = 0xb090ff;

interface PreviewHighlight {
  root: Object3D;
  hoverOutline: BoxHelper;
  selectOutline: BoxHelper;
  selectGlow: PointLight;
}

export interface MapEntityPreviewContext {
  root: Group;
  sync: () => void;
  applyEntityTransform: (uid: string) => void;
  getPickables: () => Object3D[];
  getObjectRoot: (uid: string) => Object3D | null;
  findUidForObject: (obj: Object3D) => string | null;
  setHighlight: (hoveredUid: string | null, selectedUids: ReadonlySet<string>) => void;
  updateOutlineTransforms: () => void;
  rebindTerrain: (terrain: TerrainContext) => void;
  dispose: () => void;
}

export function createMapEntityPreview(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
  store: EditorEntityStore,
): MapEntityPreviewContext {
  const root = new Group();
  root.name = 'editorEntityPreviews';
  scene.add(root);

  const uidByObject = new Map<Object3D, string>();
  const highlights = new Map<string, PreviewHighlight>();
  let terrainCtx = terrain;
  let pickablesCache: Object3D[] | null = null;
  let syncPending = false;
  let hoveredUid: string | null = null;
  let selectedUids = new Set<string>();

  const disposeHighlight = (h: PreviewHighlight) => {
    scene.remove(h.hoverOutline);
    scene.remove(h.selectOutline);
    h.selectGlow.parent?.remove(h.selectGlow);
  };

  const applyHighlightState = () => {
    for (const [uid, h] of highlights) {
      const isSelect = selectedUids.has(uid);
      const isHover = uid === hoveredUid && !isSelect;
      h.hoverOutline.visible = isHover;
      h.selectOutline.visible = isSelect;
      h.selectGlow.visible = isSelect;
      h.selectGlow.intensity = isSelect ? 1.4 : 0;
    }
  };

  const makeMarker = (color: number, scale = 1.5): Mesh => {
    const mesh = new Mesh(
      new SphereGeometry(0.6 * scale, 12, 12),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    mesh.userData.isEditorMarker = true;
    return mesh;
  };

  const attachHighlight = (uid: string, obj: Object3D): PreviewHighlight => {
    const hoverOutline = new BoxHelper(obj, HOVER_OUTLINE);
    hoverOutline.visible = false;
    scene.add(hoverOutline);

    const selectOutline = new BoxHelper(obj, SELECT_OUTLINE);
    selectOutline.visible = false;
    scene.add(selectOutline);

    const selectGlow = new PointLight(SELECT_GLOW, 0, 10);
    selectGlow.visible = false;
    obj.add(selectGlow);
    selectGlow.position.set(0, 1.2, 0);

    const entry: PreviewHighlight = { root: obj, hoverOutline, selectOutline, selectGlow };
    highlights.set(uid, entry);
    return entry;
  };

  const addPreview = (uid: string, entity: MapEntity): void => {
    const y = terrainCtx.getWorldY(entity.x, entity.z);
    let obj: Object3D;

    if (entity.type === 'prop' || entity.type === 'mountain') {
      try {
        const model = cloneFromRegistry(assets, entity.key);
        obj = model.clone(true);
        obj.position.set(entity.x, y, entity.z);
        obj.rotation.y = entity.rotY;
        obj.scale.setScalar(entity.scale);
      } catch {
        obj = new Mesh(
          new BoxGeometry(1, 2, 1),
          new MeshBasicMaterial({ color: 0x888888, wireframe: true }),
        );
        obj.position.set(entity.x, y + 1, entity.z);
      }
    } else if (entity.type === 'playerStart') {
      obj = makeMarker(MARKER_COLORS.playerStart, 1.2);
      obj.position.set(entity.x, y + 1.2, entity.z);
    } else if (entity.type === 'orb') {
      obj = makeMarker(MARKER_COLORS.orb, 0.9);
      obj.position.set(entity.x, y + 1.5, entity.z);
    } else if (entity.type === 'standingStone') {
      try {
        const model = cloneFromRegistry(assets, `stone_${entity.stoneId}`);
        obj = model.clone(true);
        obj.position.set(entity.x, y, entity.z);
        obj.rotation.y = entity.rotY ?? 0;
        obj.scale.setScalar(entity.scale ?? STONE_SCALES[entity.stoneId] ?? 1);
      } catch {
        obj = makeMarker(MARKER_COLORS.standingStone);
        obj.position.set(entity.x, y + 1, entity.z);
      }
    } else if (entity.type === 'landmark') {
      obj = makeMarker(MARKER_COLORS.landmark, 2);
      obj.position.set(entity.x, y + 1.5, entity.z);
    } else {
      return;
    }

    obj.userData.editorEntityUid = uid;
    uidByObject.set(obj, uid);
    root.add(obj);
    obj.traverse((child) => {
      if (child !== obj) child.userData.editorEntityUid = uid;
    });
    attachHighlight(uid, obj);
  };

  const rebuild = () => {
    for (const h of highlights.values()) disposeHighlight(h);
    highlights.clear();

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
    for (const { uid, entity } of store.getAll()) addPreview(uid, entity);
    applyHighlightState();
  };

  const sync = () => {
    if (syncPending) return;
    syncPending = true;
    requestAnimationFrame(() => {
      syncPending = false;
      rebuild();
    });
  };

  const getPickables = (): Object3D[] => {
    if (pickablesCache) return pickablesCache;
    const list: Object3D[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) list.push(o);
    });
    pickablesCache = list;
    return list;
  };

  const getObjectRoot = (uid: string): Object3D | null => {
    for (const [obj, id] of uidByObject) {
      if (id === uid) return obj;
    }
    return null;
  };

  const applyEntityTransform = (uid: string): void => {
    const item = store.get(uid);
    const obj = getObjectRoot(uid);
    if (!item || !obj) return;

    const entity = item.entity;
    const y = terrainCtx.getWorldY(entity.x, entity.z);

    if (entity.type === 'prop' || entity.type === 'mountain') {
      obj.position.set(entity.x, y, entity.z);
      obj.rotation.y = entity.rotY;
      obj.scale.setScalar(entity.scale);
    } else if (entity.type === 'standingStone') {
      obj.position.set(entity.x, y, entity.z);
      obj.rotation.y = entity.rotY ?? 0;
      obj.scale.setScalar(entity.scale ?? STONE_SCALES[entity.stoneId] ?? 1);
    } else if (entity.type === 'playerStart') {
      obj.position.set(entity.x, y + 1.2, entity.z);
    } else if (entity.type === 'orb') {
      obj.position.set(entity.x, y + 1.5, entity.z);
    } else if (entity.type === 'landmark') {
      obj.position.set(entity.x, y + 1.5, entity.z);
    }

    const h = highlights.get(uid);
    if (h?.hoverOutline.visible) h.hoverOutline.update();
    if (h?.selectOutline.visible) h.selectOutline.update();
  };

  const findUidForObject = (obj: Object3D): string | null => {
    let cur: Object3D | null = obj;
    while (cur) {
      const uid = cur.userData.editorEntityUid as string | undefined;
      if (uid) return uid;
      cur = cur.parent;
    }
    return null;
  };

  return {
    root,
    sync,
    applyEntityTransform,
    getPickables,
    getObjectRoot,
    findUidForObject,
    setHighlight: (hovered, selected) => {
      hoveredUid = hovered;
      selectedUids = new Set(selected);
      applyHighlightState();
    },
    updateOutlineTransforms: () => {
      for (const h of highlights.values()) {
        if (h.hoverOutline.visible) h.hoverOutline.update();
        if (h.selectOutline.visible) h.selectOutline.update();
      }
    },
    rebindTerrain: (next: TerrainContext) => {
      terrainCtx = next;
    },
    dispose: () => {
      scene.remove(root);
      for (const h of highlights.values()) disposeHighlight(h);
      highlights.clear();
    },
  };
}
