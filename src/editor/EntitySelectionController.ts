// src/editor/EntitySelectionController.ts — hover, click, and marquee selection (place mode)
import { Raycaster, Vector2, type PerspectiveCamera } from 'three';
import type { EditorEntityStore } from './EditorEntityStore';
import type { MapEntityPreviewContext } from './MapEntityPreview';
import { getObjectScreenRect, normalizeScreenRect, screenRectsIntersect } from './editorScreenRect';
import { blockTerrainPointer, consumeEntityPointerBlock } from './EditorInput';

const MARQUEE_THRESHOLD_PX = 5;

export interface EntitySelectionHandlers {
  onSelectionChange: (uids: readonly string[]) => void;
  onChanged: (opts?: { rebuild?: boolean }) => void;
}

export interface EntitySelectionContext {
  getSelectedUids: () => readonly string[];
  setEnabled: (enabled: boolean) => void;
  updateHover: () => void;
  dispose: () => void;
}

export function createEntitySelectionController(
  store: EditorEntityStore,
  getPreview: () => MapEntityPreviewContext,
  camera: PerspectiveCamera,
  domElement: HTMLElement,
  isCameraNavigate: () => boolean,
  handlers: EntitySelectionHandlers,
): EntitySelectionContext {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let enabled = true;
  const selectedUids = new Set<string>();
  let hoveredUid: string | null = null;

  const marqueeEl = document.createElement('div');
  marqueeEl.id = 'editor-marquee';
  marqueeEl.hidden = true;
  document.body.appendChild(marqueeEl);

  let pendingMarquee: { x: number; y: number; shiftKey: boolean; pointerId: number } | null = null;
  let activeMarquee = false;
  let marqueeStartX = 0;
  let marqueeStartY = 0;

  const pickUid = (clientX: number, clientY: number): string | null => {
    const rect = domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const preview = getPreview();
    const hits = raycaster.intersectObjects(preview.getPickables(), true);
    if (!hits.length) return null;
    return preview.findUidForObject(hits[0].object);
  };

  const notifySelection = () => {
    handlers.onSelectionChange([...selectedUids]);
  };

  const applyHighlight = () => {
    if (!enabled) {
      getPreview().setHighlight(null, new Set());
      return;
    }
    getPreview().setHighlight(hoveredUid, selectedUids);
  };

  const setSelection = (uids: Iterable<string>) => {
    selectedUids.clear();
    for (const uid of uids) selectedUids.add(uid);
    notifySelection();
    applyHighlight();
  };

  const clearSelection = () => {
    if (selectedUids.size === 0) return;
    selectedUids.clear();
    notifySelection();
    applyHighlight();
  };

  const selectSingle = (uid: string | null) => {
    if (uid) setSelection([uid]);
    else clearSelection();
  };

  const toggleInSelection = (uid: string) => {
    if (selectedUids.has(uid)) selectedUids.delete(uid);
    else selectedUids.add(uid);
    notifySelection();
    applyHighlight();
  };

  const updateMarqueeDom = (clientX: number, clientY: number) => {
    const r = normalizeScreenRect(marqueeStartX, marqueeStartY, clientX, clientY);
    marqueeEl.style.left = `${r.left}px`;
    marqueeEl.style.top = `${r.top}px`;
    marqueeEl.style.width = `${r.right - r.left}px`;
    marqueeEl.style.height = `${r.bottom - r.top}px`;
  };

  const hideMarquee = () => {
    marqueeEl.hidden = true;
    activeMarquee = false;
    pendingMarquee = null;
  };

  const pickUidsInMarquee = (clientX: number, clientY: number): string[] => {
    const canvasRect = domElement.getBoundingClientRect();
    const marquee = normalizeScreenRect(marqueeStartX, marqueeStartY, clientX, clientY);
    const hits: string[] = [];
    const preview = getPreview();

    for (const { uid } of store.getAll()) {
      const root = preview.getObjectRoot(uid);
      if (!root) continue;
      const screenRect = getObjectScreenRect(root, camera, canvasRect);
      if (!screenRect) continue;
      if (screenRectsIntersect(marquee, screenRect)) hits.push(uid);
    }
    return hits;
  };

  const finishMarquee = (clientX: number, clientY: number) => {
    const picked = pickUidsInMarquee(clientX, clientY);
    if (pendingMarquee?.shiftKey) {
      for (const uid of picked) selectedUids.add(uid);
      notifySelection();
      applyHighlight();
    } else {
      setSelection(picked);
    }
    hideMarquee();
  };

  const clearInteraction = () => {
    hoveredUid = null;
    hideMarquee();
    clearSelection();
    domElement.style.cursor = '';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (pendingMarquee && e.pointerId === pendingMarquee.pointerId) {
      const dx = e.clientX - pendingMarquee.x;
      const dy = e.clientY - pendingMarquee.y;
      if (!activeMarquee && dx * dx + dy * dy >= MARQUEE_THRESHOLD_PX * MARQUEE_THRESHOLD_PX) {
        activeMarquee = true;
        marqueeStartX = pendingMarquee.x;
        marqueeStartY = pendingMarquee.y;
        marqueeEl.hidden = false;
        blockTerrainPointer();
      }
      if (activeMarquee) {
        updateMarqueeDom(e.clientX, e.clientY);
        domElement.style.cursor = 'crosshair';
        return;
      }
    }

    if (!enabled || isCameraNavigate() || activeMarquee) {
      if (hoveredUid !== null) {
        hoveredUid = null;
        applyHighlight();
      }
      return;
    }

    const uid = pickUid(e.clientX, e.clientY);
    if (uid === hoveredUid) return;
    hoveredUid = uid;
    domElement.style.cursor = uid ? 'pointer' : '';
    applyHighlight();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled || e.button !== 0 || isCameraNavigate()) return;
    if (consumeEntityPointerBlock()) return;

    const uid = pickUid(e.clientX, e.clientY);
    if (uid) {
      blockTerrainPointer();
      if (e.shiftKey) toggleInSelection(uid);
      else selectSingle(uid);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    pendingMarquee = { x: e.clientX, y: e.clientY, shiftKey: e.shiftKey, pointerId: e.pointerId };
    marqueeStartX = e.clientX;
    marqueeStartY = e.clientY;
    domElement.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (pendingMarquee && e.pointerId === pendingMarquee.pointerId) {
      try {
        domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* released */
      }
      if (activeMarquee) finishMarquee(e.clientX, e.clientY);
      else if (!pendingMarquee.shiftKey) clearSelection();
      hideMarquee();
      domElement.style.cursor = '';
      return;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled || selectedUids.size === 0) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      for (const uid of [...selectedUids]) store.remove(uid);
      selectedUids.clear();
      hoveredUid = null;
      notifySelection();
      handlers.onChanged();
      applyHighlight();
    }
  };

  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerdown', onPointerDown, true);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  return {
    getSelectedUids: () => [...selectedUids],
    setEnabled: (on) => {
      enabled = on;
      if (!on) clearInteraction();
    },
    updateHover: () => {
      getPreview().updateOutlineTransforms();
    },
    dispose: () => {
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerdown', onPointerDown, true);
      domElement.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      marqueeEl.remove();
      domElement.style.cursor = '';
    },
  };
}
