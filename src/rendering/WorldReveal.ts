// src/rendering/WorldReveal.ts — energy-driven sunrise + slow day arc
import { MathUtils } from 'three';
import type { AmbientLight, DirectionalLight } from 'three';
import { bus } from '../core/EventBus';
import { state } from '../core/GameState';
import type { PlayerControllerContext } from '../entities/PlayerController';
import { checkWhisperAscension } from '../world/LandmarkProximity';
import type { PostFXContext } from './PostFX';
import type { SkySystemContext } from './SkySystem';
import { SUN_REVEAL } from './skyDefaults';

/** Animated sun elevation (degrees above horizon), shared with the game loop. */
export const sunRevealState = { elevationDeg: SUN_REVEAL.elevationNight };

export interface WorldRevealContext {
  update: (dt: number) => void;
  dispose: () => void;
}

type SunPhase = 'idle' | 'sunrise' | 'day' | 'done';

export function initWorldReveal(
  player: PlayerControllerContext,
  postFX: PostFXContext,
  ambientLight: AmbientLight,
  sun: DirectionalLight,
  sky: SkySystemContext,
): WorldRevealContext {
  const NIGHT_SKY = 0.12;
  const SUN_INTENSITY_MAX = 1.6;

  sky.setDaylight(NIGHT_SKY);
  sunRevealState.elevationDeg = SUN_REVEAL.elevationNight;

  const sunReveal = {
    active: false,
    phase: 'idle' as SunPhase,
    sunriseElapsed: 0,
    dayElapsed: 0,
  };
  let vignetteDisabled = false;

  const onEnergyChanged = () => {
    const energyRatio = Math.min(1, Math.max(0, state.energy / state.energyCap));
    player.setIlluminationRadius(energyRatio);

    if (!sunReveal.active) {
      postFX.setVignetteStrength(energyRatio);
    }

    if (state.energy >= state.energyCap && sunReveal.phase === 'idle') {
      sunReveal.active = true;
      sunReveal.phase = 'sunrise';
      sunReveal.sunriseElapsed = 0;
      sunReveal.dayElapsed = 0;
    }

    checkWhisperAscension();
  };

  const update = (dt: number) => {
    if (!sunReveal.active || sunReveal.phase === 'done') return;

    if (sunReveal.phase === 'sunrise') {
      sunReveal.sunriseElapsed = Math.min(
        sunReveal.sunriseElapsed + dt,
        SUN_REVEAL.sunriseDuration,
      );
      const t = sunReveal.sunriseElapsed / SUN_REVEAL.sunriseDuration;

      sunRevealState.elevationDeg = MathUtils.lerp(
        SUN_REVEAL.elevationNight,
        SUN_REVEAL.elevationSunrise,
        t,
      );
      sun.intensity = t * SUN_INTENSITY_MAX;
      ambientLight.intensity = 0.04 + t * (0.9 - 0.04);
      sky.setDaylight(NIGHT_SKY + t * (1 - NIGHT_SKY));

      if (t >= 1) {
        sunReveal.phase = 'day';
        if (!vignetteDisabled) {
          postFX.setVignetteStrength(1.0);
          postFX.disableVignette();
          vignetteDisabled = true;
        }
      }
      return;
    }

    if (sunReveal.phase === 'day') {
      sunReveal.dayElapsed = Math.min(
        sunReveal.dayElapsed + dt,
        SUN_REVEAL.dayArcDuration,
      );
      const t = sunReveal.dayElapsed / SUN_REVEAL.dayArcDuration;

      sunRevealState.elevationDeg = MathUtils.lerp(
        SUN_REVEAL.elevationSunrise,
        SUN_REVEAL.elevationNoon,
        t,
      );

      if (t >= 1) {
        sunReveal.phase = 'done';
      }
    }
  };

  bus.on('energy:changed', onEnergyChanged);

  return {
    update,
    dispose: () => bus.off('energy:changed', onEnergyChanged),
  };
}
