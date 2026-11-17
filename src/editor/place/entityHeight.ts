// src/editor/place/entityHeight.ts — read and set the hand-set height (`surfaceLift`, metres) of selected entities
//
// Props and landmarks take one; the other markers (orb, shrine, spawn, village seed) always follow the ground.
// 0 is ground level: a prop rests on the terrain, a landmark stands as its stand-in table puts it (see landmarkStandIns.ts).

import type { MapEntity } from '../../map/MapTypes';
import type { EditorEntityStore } from '../core/EditorEntityStore';
import type { EditorHistoryRecorder } from '../core/EditorHistory';

type HeightEntity = Extract<MapEntity, { type: 'prop' | 'landmark' }>;

const takesHeight = (e: MapEntity): e is HeightEntity => e.type === 'prop' || e.type === 'landmark';

export interface EntityHeightReading {
  /** How many of the given uids take a height. */
  count: number;
  /** Their shared height, or null when they differ. */
  liftM: number | null;
}

export function readEntityHeight(
  store: EditorEntityStore,
  uids: readonly string[],
): EntityHeightReading {
  let count = 0;
  let liftM: number | null = 0;
  for (const uid of uids) {
    const e = store.get(uid)?.entity;
    if (!e || !takesHeight(e)) continue;
    const lift = e.surfaceLift ?? 0;
    if (count === 0) liftM = lift;
    else if (liftM !== lift) liftM = null;
    count++;
  }
  return { count, liftM };
}

/** Sets the height of every uid that takes one (null or 0 clears it back to ground level). Returns those it set. */
export function setEntityHeight(
  store: EditorEntityStore,
  uids: readonly string[],
  liftM: number | null,
): string[] {
  const set: string[] = [];
  for (const uid of uids) {
    const e = store.get(uid)?.entity;
    if (!e || !takesHeight(e)) continue;
    store.update(uid, { surfaceLift: liftM ? liftM : undefined });
    set.push(uid);
  }
  return set;
}

export interface EntityHeightEditorDeps {
  store: EditorEntityStore;
  history: EditorHistoryRecorder;
  /** Redraw these entities after a change (preview meshes, outlines, gizmo). */
  redraw: (uids: readonly string[]) => void;
  /** An undo step was closed (dirty flag, undo buttons). */
  onCommitted: () => void;
}

/** The height panel's behaviour: one undo step per typing burst, one per reset. */
export function createEntityHeightEditor(deps: EntityHeightEditorDeps) {
  const { store, history, redraw, onCommitted } = deps;
  let selected: readonly string[] = [];
  let gesture: ReturnType<EditorHistoryRecorder['beginGesture']> | null = null;

  const apply = (liftM: number | null) => redraw(setEntityHeight(store, selected, liftM));

  const commit = () => {
    if (!gesture) return;
    const before = gesture;
    gesture = null;
    history.commitGesture(before);
    onCommitted();
  };

  return {
    /** The selection changed: closes a step still open on the old one. */
    setSelection: (uids: readonly string[]) => {
      commit();
      selected = uids;
    },
    read: () => readEntityHeight(store, selected),
    onInput: (liftM: number) => {
      gesture ??= history.beginGesture();
      apply(liftM);
    },
    onCommit: commit,
    onReset: () => {
      commit();
      const before = history.beginGesture();
      apply(null);
      history.commitGesture(before);
      onCommitted();
    },
  };
}
