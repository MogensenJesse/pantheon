// src/editor/place/mapEntityPreviewHighlights.ts — hover/select outlines for entity preview
import { BoxHelper, type Material, type Object3D, PointLight, type Scene } from 'three';

const HOVER_OUTLINE = 0x6a9fd8;
const SELECT_OUTLINE = 0xd4b8ff;
const SELECT_GLOW = 0xb090ff;

export interface PreviewHighlight {
  root: Object3D;
  hoverOutline: BoxHelper;
  selectOutline: BoxHelper;
  selectGlow: PointLight;
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

export function createEntityPreviewHighlights(scene: Scene): EntityPreviewHighlightState {
  const highlights = new Map<string, PreviewHighlight>();
  let hoveredUid: string | null = null;
  let selectedUids = new Set<string>();

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

  const disposeHighlight = (h: PreviewHighlight) => {
    scene.remove(h.hoverOutline);
    scene.remove(h.selectOutline);
    h.selectGlow.parent?.remove(h.selectGlow);
    h.hoverOutline.geometry?.dispose();
    (h.hoverOutline.material as Material)?.dispose();
    h.selectOutline.geometry?.dispose();
    (h.selectOutline.material as Material)?.dispose();
  };

  return {
    attach(uid, obj) {
      const existing = highlights.get(uid);
      if (existing) disposeHighlight(existing);

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

      highlights.set(uid, { root: obj, hoverOutline, selectOutline, selectGlow });
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
      selectedUids = new Set(selected);
      applyHighlightState();
    },
    updateOutlineTransforms() {
      for (const h of highlights.values()) {
        if (h.hoverOutline.visible) h.hoverOutline.update();
        if (h.selectOutline.visible) h.selectOutline.update();
      }
    },
    updateOutlinesForUid(uid) {
      const h = highlights.get(uid);
      if (!h) return;
      if (h.hoverOutline.visible) h.hoverOutline.update();
      if (h.selectOutline.visible) h.selectOutline.update();
    },
  };
}
