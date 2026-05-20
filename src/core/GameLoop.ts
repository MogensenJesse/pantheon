// src/core/GameLoop.ts
import { Clock } from 'three';

const FIXED_STEP = 1 / 50;

type UpdateFn = (dt: number) => void;
type RenderFn = (alpha: number, frameDelta: number) => void;

export interface GameLoopContext {
  start: (update: UpdateFn, render: RenderFn) => void;
  stop: () => void;
}

export function createGameLoop(): GameLoopContext {
  let accumulator = 0;
  let running = false;
  let rafId = 0;
  const clock = new Clock();

  return {
    start(update, render) {
      if (running) return;
      running = true;
      clock.start();

      const frame = () => {
        if (!running) return;
        rafId = requestAnimationFrame(frame);
        const delta = Math.min(clock.getDelta(), 0.1);
        accumulator += delta;

        while (accumulator >= FIXED_STEP) {
          update(FIXED_STEP);
          accumulator -= FIXED_STEP;
        }

        render(accumulator / FIXED_STEP, delta);
      };

      rafId = requestAnimationFrame(frame);
    },

    stop() {
      running = false;
      cancelAnimationFrame(rafId);
      accumulator = 0;
    },
  };
}

/** Shared game loop instance. */
export const GameLoop = createGameLoop();
