// src/editor/tools/PropBrushTool.ts — scatter props from a brush mix on terrain
import type { EditorEntityStore } from '../core/EditorEntityStore';
import type { EditorInputContext } from '../core/EditorInput';
import { createPropAt } from '../place/entityPlacement';

export interface PropBrushToolOptions {
  radius: number;
  /** Props placed per dab (while LMB held). */
  density: number;
  /** Min world distance between props within one stroke (metres). */
  spacing: number;
}

export interface PropBrushPreviewHandlers {
  onEntitiesAdded: (uids: readonly string[]) => void;
  onEntitiesRemoved: (uids: readonly string[]) => void;
}

export interface PropBrushToolContext {
  setOptions: (opts: Partial<PropBrushToolOptions>) => void;
  getOptions: () => Readonly<PropBrushToolOptions>;
  beginStroke: () => void;
  endStroke: () => void;
  update: (dt: number) => void;
}

const PREVIEW_INTERVAL_MS = 100;
const STAMP_INTERVAL_MS = 50;
const STAMP_ATTEMPT_MUL = 3;
const ERASE_CELL_M = 8;

interface StrokePosition {
  x: number;
  z: number;
}

interface IndexedProp {
  uid: string;
  x: number;
  z: number;
}

function randomPointInDisc(cx: number, cz: number, radius: number): StrokePosition {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return { x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r };
}

function distSqXZ(a: StrokePosition, b: StrokePosition): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function spacingCellKey(x: number, z: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
}

export function createPropBrushTool(
  store: EditorEntityStore,
  input: EditorInputContext,
  getBrushPlaceIds: () => readonly string[],
  preview: PropBrushPreviewHandlers,
): PropBrushToolContext {
  let options: PropBrushToolOptions = {
    radius: 12,
    density: 6,
    spacing: 1.2,
  };

  const strokeSpacingGrid = new Map<string, StrokePosition[]>();
  const livePropGrid = new Map<string, IndexedProp[]>();
  let strokeCellSize = 1;
  let pendingAddUids: string[] = [];
  let pendingRemoveUids: string[] = [];
  let previewTimer = 0;
  let stampTimer = 0;
  let lastStampX = Number.NaN;
  let lastStampZ = Number.NaN;
  let wasPointerDown = false;

  const flushPending = () => {
    if (pendingAddUids.length > 0) {
      preview.onEntitiesAdded(pendingAddUids);
      pendingAddUids = [];
    }
    if (pendingRemoveUids.length > 0) {
      preview.onEntitiesRemoved(pendingRemoveUids);
      pendingRemoveUids = [];
    }
    previewTimer = 0;
  };

  const indexLiveProp = (prop: IndexedProp) => {
    const key = spacingCellKey(prop.x, prop.z, ERASE_CELL_M);
    const bucket = livePropGrid.get(key);
    if (bucket) bucket.push(prop);
    else livePropGrid.set(key, [prop]);
  };

  const unindexLiveProp = (uid: string, x: number, z: number) => {
    const key = spacingCellKey(x, z, ERASE_CELL_M);
    const bucket = livePropGrid.get(key);
    if (!bucket) return;
    const i = bucket.findIndex((p) => p.uid === uid);
    if (i < 0) return;
    bucket.splice(i, 1);
    if (bucket.length === 0) livePropGrid.delete(key);
  };

  const rebuildLivePropGrid = () => {
    livePropGrid.clear();
    for (const { uid, entity } of store.getAll()) {
      if (entity.type !== 'prop') continue;
      indexLiveProp({ uid, x: entity.x, z: entity.z });
    }
  };

  const rememberStrokePosition = (pos: StrokePosition) => {
    const key = spacingCellKey(pos.x, pos.z, strokeCellSize);
    const bucket = strokeSpacingGrid.get(key);
    if (bucket) bucket.push(pos);
    else strokeSpacingGrid.set(key, [pos]);
  };

  const isTooCloseToStroke = (pos: StrokePosition): boolean => {
    const spacingSq = options.spacing * options.spacing;
    const cx = Math.floor(pos.x / strokeCellSize);
    const cz = Math.floor(pos.z / strokeCellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = strokeSpacingGrid.get(`${cx + dx},${cz + dz}`);
        if (!bucket) continue;
        for (const existing of bucket) {
          if (distSqXZ(pos, existing) < spacingSq) return true;
        }
      }
    }
    return false;
  };

  const stamp = (cx: number, cz: number) => {
    const placeIds = getBrushPlaceIds();
    if (placeIds.length === 0) return;

    const targetCount = Math.max(1, Math.round(options.density));
    const maxAttempts = targetCount * STAMP_ATTEMPT_MUL;
    let placed = 0;

    for (let attempt = 0; attempt < maxAttempts && placed < targetCount; attempt++) {
      const pos = randomPointInDisc(cx, cz, options.radius);

      if (options.spacing > 0 && isTooCloseToStroke(pos)) continue;

      const placeId = placeIds[Math.floor(Math.random() * placeIds.length)]!;
      const entity = createPropAt(placeId, pos.x, pos.z);
      if (!entity) continue;

      const uid = store.add(entity);
      if (options.spacing > 0) rememberStrokePosition(pos);
      indexLiveProp({ uid, x: pos.x, z: pos.z });
      pendingAddUids.push(uid);
      placed++;
    }
  };

  const eraseInDisc = (cx: number, cz: number) => {
    const radius = options.radius;
    const radiusSq = radius * radius;
    const iMin = Math.floor((cx - radius) / ERASE_CELL_M);
    const iMax = Math.floor((cx + radius) / ERASE_CELL_M);
    const jMin = Math.floor((cz - radius) / ERASE_CELL_M);
    const jMax = Math.floor((cz + radius) / ERASE_CELL_M);

    const toRemove: IndexedProp[] = [];
    for (let ix = iMin; ix <= iMax; ix++) {
      for (let iz = jMin; iz <= jMax; iz++) {
        const bucket = livePropGrid.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (const prop of bucket) {
          const dx = prop.x - cx;
          const dz = prop.z - cz;
          if (dx * dx + dz * dz > radiusSq) continue;
          toRemove.push(prop);
        }
      }
    }

    for (const prop of toRemove) {
      if (!store.remove(prop.uid)) continue;
      unindexLiveProp(prop.uid, prop.x, prop.z);
      pendingRemoveUids.push(prop.uid);
    }
  };

  const shouldDab = (hitX: number, hitZ: number, dt: number): boolean => {
    stampTimer -= dt * 1000;
    if (Number.isNaN(lastStampX)) return true;
    const moved = Math.hypot(hitX - lastStampX, hitZ - lastStampZ);
    if (moved < 1e-4) return false;
    const spacingGate = Math.max(options.spacing * 0.35, 0.05);
    return moved >= spacingGate || stampTimer <= 0;
  };

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
    },
    getOptions: () => options,
    beginStroke: () => {
      strokeSpacingGrid.clear();
      strokeCellSize = Math.max(options.spacing, 0.001);
      pendingAddUids = [];
      pendingRemoveUids = [];
      lastStampX = Number.NaN;
      lastStampZ = Number.NaN;
      stampTimer = 0;
      rebuildLivePropGrid();
    },
    endStroke: () => {
      flushPending();
    },
    update: (dt) => {
      const pointerDown = input.isPointerDown() && !input.isSpaceDown();
      const erasing = pointerDown && input.isShiftDown();

      if (!pointerDown && wasPointerDown) {
        flushPending();
      }
      wasPointerDown = pointerDown;

      if (!pointerDown) {
        if ((pendingAddUids.length > 0 || pendingRemoveUids.length > 0) && previewTimer <= 0) {
          flushPending();
        } else if (previewTimer > 0) {
          previewTimer -= dt * 1000;
        }
        return;
      }

      const hit = input.getHit();
      if (!hit) return;

      if (erasing) {
        if (shouldDab(hit.x, hit.z, dt)) {
          eraseInDisc(hit.x, hit.z);
          lastStampX = hit.x;
          lastStampZ = hit.z;
          stampTimer = STAMP_INTERVAL_MS;
        }
      } else if (shouldDab(hit.x, hit.z, dt)) {
        stamp(hit.x, hit.z);
        lastStampX = hit.x;
        lastStampZ = hit.z;
        stampTimer = STAMP_INTERVAL_MS;
      }

      previewTimer -= dt * 1000;
      if (previewTimer <= 0) {
        flushPending();
        previewTimer = PREVIEW_INTERVAL_MS;
      }
    },
  };
}
