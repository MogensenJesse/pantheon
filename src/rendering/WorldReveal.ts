// src/rendering/WorldReveal.ts — energy-driven night → day reveal
import { MathUtils } from 'three';
import type { AmbientLight, DirectionalLight } from 'three';
import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { state } from '../core/GameState';
import type { PlayerControllerContext } from '../entities/PlayerController';
import { checkWhisperAscension } from '../world/LandmarkProximity';
import type { PostFXContext } from './PostFX';
import type { SkySystemContext } from './SkySystem';
import { SUN_REVEAL } from './skyDefaults';

const { NIGHT_SKY, SUN_INTENSITY_MAX, AMBIENT_MIN, AMBIENT_MAX } = PHASE0.SKY_REVEAL;

/** Animated sun elevation (degrees above horizon), shared with the game loop. */
export const sunRevealState = { elevationDeg: SUN_REVEAL.elevationNight };

let _sunRevealAnimating = false;
let _revealProgress: number | null = null;
let _revealPhase: 'idle' | 'revealing' | 'done' = 'idle';

/** True while the energy-cap reveal is driving sun elevation and lighting. */
export function isSunRevealAnimating(): boolean {
  return _sunRevealAnimating;
}

/** Reveal progress 0–1 while phase === 'revealing'; null otherwise. */
export function getSunRevealProgress(): number | null {
  return _revealProgress;
}

export function isSunRevealDone(): boolean {
  return _revealPhase === 'done';
}

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
  sky.setDaylight(NIGHT_SKY);
  sunRevealState.elevationDeg = SUN_REVEAL.elevationNight;
  _revealPhase = 'idle';

  const sunReveal = {
    active: false,
    elapsed: 0,
  };
  let vignetteDisabled = false;

  const onEnergyChanged = () => {
    const energyRatio = Math.min(1, Math.max(0, state.energy / state.energyCap));
    player.setIlluminationRadius(energyRatio);

    if (!sunReveal.active) {
      postFX.setVignetteStrength(energyRatio);
    }

    if (state.energy >= state.energyCap && _revealPhase === 'idle') {
      sunReveal.active = true;
      _revealPhase = 'revealing';
      sunReveal.elapsed = 0;
    }

    checkWhisperAscension();
  };

  const update = (dt: number) => {
    if (!sunReveal.active || _revealPhase === 'done') {
      _sunRevealAnimating = false;
      _revealProgress = null;
      return;
    }

    if (_revealPhase === 'revealing') {
      _sunRevealAnimating = true;
      sunReveal.elapsed = Math.min(sunReveal.elapsed + dt, SUN_REVEAL.revealDuration);
      const t = sunReveal.elapsed / SUN_REVEAL.revealDuration;
      _revealProgress = t;

      sunRevealState.elevationDeg = MathUtils.lerp(
        SUN_REVEAL.elevationNight,
        SUN_REVEAL.elevationDay,
        t,
      );
      sun.intensity = t * SUN_INTENSITY_MAX;
      ambientLight.intensity = AMBIENT_MIN + t * (AMBIENT_MAX - AMBIENT_MIN);
      sky.setDaylight(NIGHT_SKY + t * (1 - NIGHT_SKY));

      if (t >= 1) {
        sunRevealState.elevationDeg = SUN_REVEAL.elevationDay;
        _revealPhase = 'done';
        _revealProgress = null;
        if (!vignetteDisabled) {
          postFX.setVignetteStrength(1.0);
          postFX.disableVignette();
          vignetteDisabled = true;
        }
      }
      return;
    }

    _sunRevealAnimating = false;
    _revealProgress = null;
  };

  bus.on('energy:changed', onEnergyChanged);

  return {
    update,
    dispose: () => bus.off('energy:changed', onEnergyChanged),
  };
}
