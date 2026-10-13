// src/dev/runtime/shadowProbes.ts — DEV console hooks for sun-shadow debugging
import { type DirectionalLight, Vector3 } from 'three';
import { WORLD } from '../../config/world';
import {
  copyBakedSunDirection,
  getCloudCastBakeCount,
  getWorldCascadeTune,
  invalidateWorldCascadeShadowMap,
  resetWorldCascadeTune,
  setWorldCascadeFrozen,
  setWorldCascadeTune,
  setWorldShadowView,
} from '../../rendering/sunShadow';

interface ShadowProbeContext {
  /** CPU terrain height: the surface the player and props stand on. */
  getWorldY: (x: number, z: number) => number;
  sun: DirectionalLight;
  getPlayerPosition: () => Vector3;
}

const MAX_MARCH_M = 6000;

/**
 * Install `window.__pantheonShadowProbe(stepM?)`, `window.__pantheonWorldShadow` and
 * `window.__pantheonCloudCastBakes()` (cloud-cast maps baked since load; diff over time = bakes/s).
 * The probe marches the CPU terrain from the player toward the real sun and reports the first
 * terrain above the ray, so a shadow on screen can be checked against geometry that exists.
 * Returns a disposer that removes the hooks.
 */
export function initShadowProbes(ctx: ShadowProbeContext): () => void {
  const win = window as unknown as Record<string, unknown>;
  const dir = new Vector3();

  win.__pantheonShadowProbe = (stepM = 2) => {
    copyBakedSunDirection(ctx.sun, dir);
    const player = ctx.getPlayerPosition();
    const y0 = ctx.getWorldY(player.x, player.z) + 0.5;
    const half = WORLD.SIZE * 0.5;
    const base = {
      playerXZ: [Math.round(player.x), Math.round(player.z)],
      sunElevationDeg: +((Math.asin(dir.y) * 180) / Math.PI).toFixed(1),
    };
    for (let t = stepM; t < MAX_MARCH_M; t += stepM) {
      const x = player.x + dir.x * t;
      const z = player.z + dir.z * t;
      if (Math.abs(x) > half || Math.abs(z) > half) break;
      const groundY = ctx.getWorldY(x, z);
      const rayY = y0 + dir.y * t;
      if (groundY > rayY) {
        return {
          blocked: true,
          occluderDistanceM: Math.round(t),
          occluderXZ: [Math.round(x), Math.round(z)],
          occluderGroundY: Math.round(groundY),
          rayY: Math.round(rayY),
          ...base,
        };
      }
    }
    return { blocked: false, ...base };
  };

  win.__pantheonWorldShadow = {
    get: getWorldCascadeTune,
    set: setWorldCascadeTune,
    reset: resetWorldCascadeTune,
    freeze: setWorldCascadeFrozen,
    invalidate: invalidateWorldCascadeShadowMap,
    view: setWorldShadowView,
  };

  win.__pantheonCloudCastBakes = getCloudCastBakeCount;

  return () => {
    delete win.__pantheonShadowProbe;
    delete win.__pantheonWorldShadow;
    delete win.__pantheonCloudCastBakes;
  };
}
