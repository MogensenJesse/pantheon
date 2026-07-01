// src/core/GameLoop.ts
import { Timer } from 'three';

const FIXED_STEP = 1 / 50;

type UpdateFn = (dt: number) => void;
type RenderFn = (
  /** Interpolation alpha between fixed steps (0..1); unused until render-side blending is added. */
  alpha: number,
  frameDelta: number,
) => void | Promise<void>;

export interface GameLoopContext {
  start: (update: UpdateFn, render: RenderFn) => void;
  stop: () => void;
}

function createGameLoop(): GameLoopContext {
  let accumulator = 0;
  let running = false;
  let rafId = 0;
  const timer = new Timer();

  return {
    start(update, render) {
      if (running) return;
      running = true;

      const frame = () => {
        if (!running) return;
        timer.update();
        const delta = Math.min(timer.getDelta(), 0.1);
        accumulator += delta;

        while (accumulator >= FIXED_STEP) {
          update(FIXED_STEP);
          accumulator -= FIXED_STEP;
        }

        void Promise.resolve(render(accumulator / FIXED_STEP, delta))
          .catch((err) => {
            console.error('[GameLoop] render failed:', err);
          })
          .finally(() => {
            if (running) rafId = requestAnimationFrame(frame);
          });
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
