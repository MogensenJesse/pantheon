// src/rendering/WorldReveal.ts — energy-driven sun reveal and vignette fade
import type { AmbientLight, DirectionalLight } from 'three';
import { bus } from '../core/EventBus';
import { state } from '../core/GameState';
import type { PlayerControllerContext } from '../entities/PlayerController';
import { checkWhisperAscension } from '../world/LandmarkProximity';
import type { PostFXContext } from './PostFX';
import type { SkySystemContext } from './SkySystem';

export interface WorldRevealContext {
  update: (dt: number) => void;
  dispose: () => void;
}

export function initWorldReveal(
  player: PlayerControllerContext,
  postFX: PostFXContext,
  ambientLight: AmbientLight,
  sun: DirectionalLight,
  sky: SkySystemContext,
): WorldRevealContext {
  const NIGHT_SKY = 0.12;
  sky.setDaylight(NIGHT_SKY);
  const sunReveal = { active: false, elapsed: 0, duration: 3.0 };
  let vignetteDisabled = false;

  const onEnergyChanged = () => {
    const energyRatio = Math.min(1, Math.max(0, state.energy / state.energyCap));
    player.setIlluminationRadius(energyRatio);

    if (!sunReveal.active) {
      postFX.setVignetteStrength(energyRatio);
    }

    if (state.energy >= state.energyCap && !sunReveal.active) {
      sunReveal.active = true;
      sunReveal.elapsed = 0;
    }

    checkWhisperAscension();
  };

  const update = (dt: number) => {
    if (!sunReveal.active || vignetteDisabled) return;

    sunReveal.elapsed = Math.min(sunReveal.elapsed + dt, sunReveal.duration);
    const t = sunReveal.elapsed / sunReveal.duration;

    sun.intensity = t * 1.6;
    // RenderDebugController.applyRenderDebug() runs after this in the same frame
    // and is the final authority on sun.castShadow in DEV builds.
    sun.castShadow = sun.intensity > 0.02;
    ambientLight.intensity = 0.04 + t * (0.9 - 0.04);
    sky.setDaylight(NIGHT_SKY + t * (1 - NIGHT_SKY));

    if (t >= 1) {
      postFX.setVignetteStrength(1.0);
      postFX.disableVignette();
      vignetteDisabled = true;
    }
  };

  bus.on('energy:changed', onEnergyChanged);

  return {
    update,
    dispose: () => bus.off('energy:changed', onEnergyChanged),
  };
}
