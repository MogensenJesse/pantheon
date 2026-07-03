// src/editor/tools/PropBrushTool.ts — scatter props from a brush mix on terrain
import type { EditorEntityStore } from '../core/EditorEntityStore';
import type { EditorInputContext } from '../core/EditorInput';
import { createPropAt } from '../place/entityPlacement';

export interface PropBrushToolOptions {
  radius: number;
  /** Props placed per dab (per frame while LMB held). */
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
const STAMP_ATTEMPT_MUL = 3;

interface StrokePosition {
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
  let strokeCellSize = 1;
  let pendingAddUids: string[] = [];
  let pendingRemoveUids: string[] = [];
  let previewTimer = 0;
  let wasPointerDown = false;

  const flushPreview = () => {
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
      pendingAddUids.push(uid);
      placed++;
    }
  };

  const eraseInDisc = (cx: number, cz: number) => {
    const radius = options.radius;
    const radiusSq = radius * radius;
    const minX = cx - radius;
    const maxX = cx + radius;
    const minZ = cz - radius;
    const maxZ = cz + radius;

    for (const { uid, entity } of store.getAll()) {
      if (entity.type !== 'prop') continue;
      if (entity.x < minX || entity.x > maxX || entity.z < minZ || entity.z > maxZ) continue;
      const dx = entity.x - cx;
      const dz = entity.z - cz;
      if (dx * dx + dz * dz > radiusSq) continue;
      if (!store.remove(uid)) continue;
      pendingRemoveUids.push(uid);
    }
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
    },
    endStroke: () => {
      flushPreview();
    },
    update: (dt) => {
      const pointerDown = input.isPointerDown() && !input.isSpaceDown();
      const erasing = pointerDown && input.isShiftDown();

      if (!pointerDown && wasPointerDown) {
        flushPreview();
      }
      wasPointerDown = pointerDown;

      if (!pointerDown) {
        if ((pendingAddUids.length > 0 || pendingRemoveUids.length > 0) && previewTimer <= 0) {
          flushPreview();
        } else if (previewTimer > 0) {
          previewTimer -= dt * 1000;
        }
        return;
      }

      const hit = input.getHit();
      if (!hit) return;

      if (erasing) eraseInDisc(hit.x, hit.z);
      else stamp(hit.x, hit.z);

      previewTimer -= dt * 1000;
      if (previewTimer <= 0) {
        flushPreview();
        previewTimer = PREVIEW_INTERVAL_MS;
      }
    },
  };
}
