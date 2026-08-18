// src/editor/place/mapEntityPreviewHighlights.ts — hover/select AABB outlines for entity preview
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  type Object3D,
  type Scene,
} from 'three';
import { getEditorLocalAabb } from './editorLocalAabb';

const HOVER_OUTLINE = 0x6a9fd8;
const SELECT_OUTLINE = 0xd4b8ff;

/** 12 box edges as pairs of the 8 AABB corners (x=bit0, y=bit1, z=bit2). */
const BOX_EDGES: readonly [number, number][] = [
  [0, 1],
  [1, 5],
  [5, 4],
  [4, 0],
  [2, 3],
  [3, 7],
  [7, 6],
  [6, 2],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
];

export interface PreviewHighlight {
  root: Object3D;
  outline: LineSegments;
}

export interface EntityPreviewHighlightState {
  attach: (uid: string, obj: Object3D) => void;
  detach: (uid: string) => void;
  disposeAll: () => void;
  get: (uid: string) => PreviewHighlight | undefined;
  setSelection: (hoveredUid: string | null, selectedUids: ReadonlySet<string>) => void;
  updateOutlineTransforms: () => void;
  updateOutlinesForUid: (uid: string) => void;
}

function cornerXYZ(
  i: number,
  minx: number,
  miny: number,
  minz: number,
  maxx: number,
  maxy: number,
  maxz: number,
) {
  return {
    x: i & 1 ? maxx : minx,
    y: i & 2 ? maxy : miny,
    z: i & 4 ? maxz : minz,
  };
}

function makeLocalAabbOutline(obj: Object3D, material: LineBasicMaterial): LineSegments | null {
  const local = getEditorLocalAabb(obj);
  if (!local || local.isEmpty()) return null;

  const { min, max } = local;
  const positions = new Float32Array(BOX_EDGES.length * 2 * 3);
  let w = 0;
  for (const [a, b] of BOX_EDGES) {
    const pa = cornerXYZ(a, min.x, min.y, min.z, max.x, max.y, max.z);
    const pb = cornerXYZ(b, min.x, min.y, min.z, max.x, max.y, max.z);
    positions[w++] = pa.x;
    positions[w++] = pa.y;
    positions[w++] = pa.z;
    positions[w++] = pb.x;
    positions[w++] = pb.y;
    positions[w++] = pb.z;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const line = new LineSegments(geometry, material);
  line.name = 'editorEntityOutline';
  line.frustumCulled = false;
  line.renderOrder = 998;
  line.visible = false;
  line.raycast = () => {};
  return line;
}

export function createEntityPreviewHighlights(_scene: Scene): EntityPreviewHighlightState {
  const highlights = new Map<string, PreviewHighlight>();
  let hoveredUid: string | null = null;
  let selectedUids: ReadonlySet<string> = new Set();

  const hoverMat = new LineBasicMaterial({
    color: HOVER_OUTLINE,
    depthTest: true,
    fog: false,
  });
  const selectMat = new LineBasicMaterial({
    color: SELECT_OUTLINE,
    depthTest: true,
    fog: false,
  });

  const applyHighlightState = () => {
    for (const [uid, h] of highlights) {
      const isSelect = selectedUids.has(uid);
      const isHover = uid === hoveredUid && !isSelect;
      h.outline.visible = isSelect || isHover;
      h.outline.material = isSelect ? selectMat : hoverMat;
    }
  };

  const disposeHighlight = (h: PreviewHighlight) => {
    h.root.remove(h.outline);
    h.outline.geometry.dispose();
  };

  return {
    attach(uid, obj) {
      const existing = highlights.get(uid);
      if (existing) disposeHighlight(existing);

      const outline = makeLocalAabbOutline(obj, hoverMat);
      if (!outline) {
        highlights.delete(uid);
        return;
      }
      obj.add(outline);
      highlights.set(uid, { root: obj, outline });
    },
    detach(uid) {
      const existing = highlights.get(uid);
      if (!existing) return;
      disposeHighlight(existing);
      highlights.delete(uid);
    },
    disposeAll() {
      for (const h of highlights.values()) disposeHighlight(h);
      highlights.clear();
    },
    get: (uid) => highlights.get(uid),
    setSelection(hovered, selected) {
      hoveredUid = hovered;
      selectedUids = selected;
      const drop: string[] = [];
      for (const uid of highlights.keys()) {
        if (uid !== hoveredUid && !selectedUids.has(uid)) drop.push(uid);
      }
      for (const uid of drop) {
        const existing = highlights.get(uid);
        if (!existing) continue;
        disposeHighlight(existing);
        highlights.delete(uid);
      }
      applyHighlightState();
    },
    updateOutlineTransforms() {
      /* Outlines are parented in local AABB space — the object transform carries them. */
    },
    updateOutlinesForUid() {
      /* Same as updateOutlineTransforms. */
    },
  };
}
