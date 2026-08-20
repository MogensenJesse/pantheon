// src/core/GameLoop.ts
import { Timer } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

const FIXED_STEP = 1 / 50;

type UpdateFn = (dt: number) => void;
type RenderFn = (
  /** Interpolation alpha between fixed steps (0..1); unused until render-side blending is added. */
  alpha: number,
  frameDelta: number,
) => void | Promise<void>;

interface AnimationLoopHost {
  setAnimationLoop: (callback: ((time: number, frame?: XRFrame) => void) | null) => void;
}

export interface GameLoopContext {
  start: (update: UpdateFn, render: RenderFn, renderer?: WebGPURenderer) => void;
  stop: () => void;
}

function createGameLoop(): GameLoopContext {
  let accumulator = 0;
  let running = false;
  let rafId = 0;
  let renderInFlight = false;
  let animationHost: AnimationLoopHost | null = null;
  const timer = new Timer();

  const tick = (update: UpdateFn, render: RenderFn) => {
    if (!running || renderInFlight) return;
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.1);
    accumulator += delta;

    while (accumulator >= FIXED_STEP) {
      update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }

    const result = render(accumulator / FIXED_STEP, delta);
    if (result !== undefined && typeof result.then === 'function') {
      renderInFlight = true;
      void result
        .catch((err) => {
          console.error('[GameLoop] render failed:', err);
        })
        .finally(() => {
          renderInFlight = false;
        });
    }
  };

  return {
    start(update, render, renderer) {
      if (running) return;
      running = true;

      if (renderer) {
        animationHost = renderer as unknown as AnimationLoopHost;
        if (typeof animationHost.setAnimationLoop === 'function') {
          animationHost.setAnimationLoop(() => tick(update, render));
          return;
        }
        animationHost = null;
      }

      const frame = () => {
        if (!running) return;
        tick(update, render);
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
    },

    stop() {
      running = false;
      cancelAnimationFrame(rafId);
      animationHost?.setAnimationLoop(null);
      animationHost = null;
      renderInFlight = false;
      accumulator = 0;
    },
  };
}

/** Shared game loop instance. */
export const GameLoop = createGameLoop();
