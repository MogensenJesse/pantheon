// src/core/reveal/WorldReveal.ts — energy-driven night → day reveal

import type { AmbientLight, DirectionalLight } from 'three';
import { MathUtils } from 'three';
import type { PostFXContext } from '../../rendering/PostFX';
import { applyWorldLightingFromElevation } from '../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { SUN_REVEAL } from '../../rendering/sky/skyDefaults';
import { checkWhisperAscension } from '../../world/LandmarkProximity';
import { isDayCycleDevScrubLocked } from './dayCycleDevScrub';
import { bus } from '../EventBus';
import { state } from '../GameState';

/** Animated sun elevation (degrees above horizon), shared with the game loop. */
export const sunRevealState: { elevationDeg: number } = { elevationDeg: SUN_REVEAL.elevationNight };

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

export function getSunRevealPhase(): 'idle' | 'revealing' | 'done' {
  return _revealPhase;
}

export interface WorldRevealContext {
  update: (dt: number) => void;
  dispose: () => void;
}

export function initWorldReveal(
  postFX: PostFXContext,
  ambientLight: AmbientLight,
  sun: DirectionalLight,
  sky: SkySystemContext,
): WorldRevealContext {
  applyWorldLightingFromElevation(SUN_REVEAL.elevationNight, sun, ambientLight, sky);
  sunRevealState.elevationDeg = SUN_REVEAL.elevationNight;
  _revealPhase = 'idle';

  const sunReveal = {
    active: false,
    elapsed: 0,
  };
  let vignetteDisabled = false;

  const onEnergyChanged = () => {
    const energyRatio = Math.min(1, Math.max(0, state.energy / state.energyCap));

    if (!sunReveal.active) {
      postFX.setVignetteStrength(energyRatio);
    }

    if (state.energy >= state.energyCap && _revealPhase === 'idle') {
      sunReveal.active = true;
      _revealPhase = 'revealing';
      sunReveal.elapsed = 0;
      _revealProgress = 0;
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
      if (isDayCycleDevScrubLocked()) return;

      _sunRevealAnimating = true;
      sunReveal.elapsed = Math.min(sunReveal.elapsed + dt, SUN_REVEAL.revealDuration);
      const t = sunReveal.elapsed / SUN_REVEAL.revealDuration;
      _revealProgress = t;

      sunRevealState.elevationDeg = MathUtils.lerp(
        SUN_REVEAL.elevationNight,
        SUN_REVEAL.elevationDay,
        t,
      );
      applyWorldLightingFromElevation(sunRevealState.elevationDeg, sun, ambientLight, sky);

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
