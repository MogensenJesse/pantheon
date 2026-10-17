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
  /**
   * Freeze the world: no fixed steps run and the frame time passed to `render` is 0, so clocks,
   * animation and the sky stand still while the frame is still drawn (a resize or a menu needs one).
   */
  setPaused: (paused: boolean) => void;
  isPaused: () => boolean;
}

function createGameLoop(): GameLoopContext {
  let accumulator = 0;
  let running = false;
  let rafId = 0;
  let renderInFlight = false;
  let animationHost: AnimationLoopHost | null = null;
  let paused = false;
  const timer = new Timer();

  const tick = (update: UpdateFn, render: RenderFn) => {
    if (!running || renderInFlight) return;
    timer.update();
    // Read every frame, paused or not, so the time spent paused never arrives as one big step.
    const delta = Math.min(timer.getDelta(), 0.1);
    if (!paused) {
      accumulator += delta;
      while (accumulator >= FIXED_STEP) {
        update(FIXED_STEP);
        accumulator -= FIXED_STEP;
      }
    }

    const result = render(accumulator / FIXED_STEP, paused ? 0 : delta);
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

    setPaused(next) {
      paused = next;
    },

    isPaused: () => paused,

    stop() {
      running = false;
      paused = false;
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
