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

export function createPropBrushTool(
  store: EditorEntityStore,
  input: EditorInputContext,
  getBrushPlaceIds: () => readonly string[],
  onEntitiesChanged: () => void,
): PropBrushToolContext {
  let options: PropBrushToolOptions = {
    radius: 12,
    density: 6,
    spacing: 1.2,
  };

  let strokePositions: StrokePosition[] = [];
  let previewTimer = 0;
  let previewDirty = false;
  let wasPointerDown = false;

  const flushPreview = () => {
    if (!previewDirty) return;
    onEntitiesChanged();
    previewDirty = false;
    previewTimer = 0;
  };

  const stamp = (cx: number, cz: number) => {
    const placeIds = getBrushPlaceIds();
    if (placeIds.length === 0) return;

    const spacingSq = options.spacing * options.spacing;
    const targetCount = Math.max(1, Math.round(options.density));
    const maxAttempts = targetCount * STAMP_ATTEMPT_MUL;
    let placed = 0;

    for (let attempt = 0; attempt < maxAttempts && placed < targetCount; attempt++) {
      const pos = randomPointInDisc(cx, cz, options.radius);

      if (options.spacing > 0) {
        let tooClose = false;
        for (const existing of strokePositions) {
          if (distSqXZ(pos, existing) < spacingSq) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
      }

      const placeId = placeIds[Math.floor(Math.random() * placeIds.length)]!;
      const entity = createPropAt(placeId, pos.x, pos.z);
      if (!entity) continue;

      store.add(entity);
      strokePositions.push(pos);
      placed++;
      previewDirty = true;
    }
  };

  return {
    setOptions: (opts) => {
      options = { ...options, ...opts };
    },
    getOptions: () => options,
    beginStroke: () => {
      strokePositions = [];
    },
    endStroke: () => {
      flushPreview();
    },
    update: (dt) => {
      const pointerDown = input.isPointerDown() && !input.isShiftDown();

      if (!pointerDown && wasPointerDown) {
        flushPreview();
      }
      wasPointerDown = pointerDown;

      if (!pointerDown) {
        if (previewDirty && previewTimer <= 0) flushPreview();
        else if (previewTimer > 0) previewTimer -= dt * 1000;
        return;
      }

      const hit = input.getHit();
      if (!hit) return;

      stamp(hit.x, hit.z);

      previewTimer -= dt * 1000;
      if (previewTimer <= 0) {
        flushPreview();
        previewTimer = PREVIEW_INTERVAL_MS;
      }
    },
  };
}
