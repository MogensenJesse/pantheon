// src/editor/core/EditorToolCoordinator.ts — tool/sub-mode switching and stroke lifecycle

import type { EditorPlaceModeContext } from '../place/EditorPlaceMode';
import type { PaintBiomeToolContext } from '../tools/PaintBiomeTool';
import type { PropBrushToolContext } from '../tools/PropBrushTool';
import type { SculptToolContext } from '../tools/SculptTool';
import type { EditorBrushPreviewContext } from './EditorBrushPreview';
import type { EditorHistoryContext, EditorSnapshot } from './EditorHistory';
import type { EditorInputContext } from './EditorInput';
import type {
  EditorToolId,
  EditorWorkspaceStore,
  PaintSubMode,
  PlaceSubMode,
} from './EditorWorkspaceStore';

export interface EditorToolCoordinatorDeps {
  store: EditorWorkspaceStore;
  history: EditorHistoryContext;
  input: EditorInputContext;
  sculpt: SculptToolContext;
  paint: PaintBiomeToolContext;
  propBrush: PropBrushToolContext;
  placeMode: EditorPlaceModeContext;
  brushPreview: EditorBrushPreviewContext;
  onChromeChange?: () => void;
}

export interface EditorToolCoordinator {
  setTool: (tool: EditorToolId) => void;
  setPlaceSubMode: (mode: PlaceSubMode) => void;
  setPaintSubMode: (mode: PaintSubMode) => void;
  tick: (dt: number) => void;
  syncPlaceInteractions: () => void;
}

export function createEditorToolCoordinator(
  deps: EditorToolCoordinatorDeps,
): EditorToolCoordinator {
  const {
    store,
    history,
    input,
    sculpt,
    paint,
    propBrush,
    placeMode,
    brushPreview,
    onChromeChange,
  } = deps;

  let strokeBefore: EditorSnapshot | null = null;
  let wasPointerDown = false;

  const toolState = () => store.get();

  const strokeGridRegion = () => {
    const { tool } = toolState();
    if (tool === 'sculpt') return sculpt.getStrokeRegion();
    if (tool === 'paint') return paint.getStrokeRegion();
    return undefined;
  };

  const beginToolStroke = (onBegin?: () => void) => {
    strokeBefore = history.beginGesture();
    onBegin?.();
  };

  const commitToolStroke = (onEnd?: () => void) => {
    if (!strokeBefore) {
      wasPointerDown = false;
      return;
    }
    onEnd?.();
    history.commitGesture(strokeBefore, strokeGridRegion());
    strokeBefore = null;
    wasPointerDown = false;
    onChromeChange?.();
  };

  const syncPlaceInteractions = () => {
    const { tool, placeSubMode } = toolState();
    placeMode.setEnabled(tool === 'place' && placeSubMode === 'single');
  };

  const setTool = (next: EditorToolId) => {
    const { tool, placeSubMode } = toolState();
    commitToolStroke(() => {
      if (tool === 'place' && placeSubMode === 'brush') propBrush.endStroke();
    });
    store.patch({ tool: next });
    syncPlaceInteractions();
  };

  const setPlaceSubMode = (mode: PlaceSubMode) => {
    const { placeSubMode } = toolState();
    if (placeSubMode === 'brush' && mode !== 'brush') {
      commitToolStroke(() => propBrush.endStroke());
    }
    store.patch({ placeSubMode: mode });
    syncPlaceInteractions();
  };

  const setPaintSubMode = (mode: PaintSubMode) => {
    const { paintSubMode } = toolState();
    if (paintSubMode === 'brush' && mode !== 'brush') {
      commitToolStroke();
    }
    store.patch({ paintSubMode: mode });
  };

  const tickBrushPreview = () => {
    const { tool, paintSubMode, placeSubMode } = toolState();
    const hit = input.getHit();
    const navigating = input.isSpaceDown();

    if (tool === 'sculpt' || (tool === 'paint' && paintSubMode === 'brush')) {
      if (tool === 'sculpt') {
        const opts = sculpt.getOptions();
        brushPreview.update(hit, { radius: opts.radius, visible: !navigating });
      } else {
        const opts = paint.getOptions();
        brushPreview.update(hit, {
          radius: opts.radius,
          hardness: opts.hardness,
          visible: !navigating,
        });
      }
      return;
    }

    if (tool === 'place' && placeSubMode === 'brush') {
      brushPreview.update(hit, {
        radius: propBrush.getOptions().radius,
        visible: !navigating,
      });
      return;
    }

    brushPreview.update(null, { radius: 0, visible: false });
  };

  const tick = (dt: number) => {
    const { tool, paintSubMode, placeSubMode } = toolState();

    if (tool === 'sculpt' || (tool === 'paint' && paintSubMode === 'brush')) {
      const pointerDown = input.isPointerDown() && !input.isSpaceDown();
      if (pointerDown && !wasPointerDown) {
        beginToolStroke(() => {
          if (tool === 'sculpt') sculpt.beginStroke();
          else paint.beginStroke();
        });
      }
      if (tool === 'sculpt') sculpt.update(dt);
      else paint.update(dt);
      if (!pointerDown && wasPointerDown) commitToolStroke();
      else wasPointerDown = pointerDown;
    } else if (tool === 'place' && placeSubMode === 'brush') {
      const pointerDown = input.isPointerDown() && !input.isSpaceDown();
      if (pointerDown && !wasPointerDown) {
        beginToolStroke(() => propBrush.beginStroke());
      }
      propBrush.update(dt);
      if (!pointerDown && wasPointerDown) commitToolStroke(() => propBrush.endStroke());
      else wasPointerDown = pointerDown;
    } else {
      commitToolStroke();
    }

    tickBrushPreview();

    if (tool === 'place' && placeSubMode === 'single') {
      placeMode.gizmo.update();
    }
  };

  return {
    setTool,
    setPlaceSubMode,
    setPaintSubMode,
    tick,
    syncPlaceInteractions,
  };
}
