// src/editor/tools/gridBrushFlushLoop.ts — shared debounced flush while pointer held (sculpt/paint)

export interface GridBrushFlushLoop {
  tick: (dt: number, pointerDown: boolean, stamp: () => void, stampWithFlush?: boolean) => void;
}

export function createGridBrushFlushLoop(
  intervalMs: number,
  flush: () => void,
  isDirty: () => boolean,
): GridBrushFlushLoop {
  let timer = 0;
  let wasPointerDown = false;

  return {
    tick(dt, pointerDown, stamp, stampWithFlush = false) {
      const rising = pointerDown && !wasPointerDown;
      if (!pointerDown && wasPointerDown) flush();
      wasPointerDown = pointerDown;

      if (!pointerDown) {
        if (isDirty() && timer <= 0) flush();
        else if (timer > 0) timer -= dt * 1000;
        return;
      }

      if (stampWithFlush) {
        if (rising) timer = 0;
        timer -= dt * 1000;
        if (timer <= 0) {
          stamp();
          flush();
          timer = intervalMs;
        }
        return;
      }

      stamp();

      timer -= dt * 1000;
      if (timer <= 0) {
        flush();
        timer = intervalMs;
      }
    },
  };
}
