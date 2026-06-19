// src/core/reveal/WorldReveal.ts — energy-driven night → day reveal

import type { AmbientLight, DirectionalLight } from 'three';
import { MathUtils } from 'three';
import { PHASE0 } from '../../config/phase0';
import type { PostFXContext } from '../../rendering/PostFX';
import { applyWorldLightingFromElevation } from '../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { SUN_REVEAL } from '../../rendering/sky/skyDefaults';
import { bus } from '../EventBus';
import { state } from '../GameState';
import { isDayCycleDevScrubLocked } from './dayCycleDevScrub';

/** Animated sun elevation (degrees above horizon), shared with the game loop. */
export const sunRevealState: { elevationDeg: number } = { elevationDeg: SUN_REVEAL.elevationNight };

let _revealPhase: 'idle' | 'revealing' | 'done' = 'idle';

function checkWhisperAscension(): void {
  if (state.phase >= 1) return;
  if (state.energy < state.energyCap) return;
  state.phase = 1;
  bus.emit('memory:trigger', { id: PHASE0.AETHON_MEMORY_ID });
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

class WorldRevealController implements WorldRevealContext {
  private readonly sunReveal = { active: false, elapsed: 0 };
  private vignetteDisabled = false;
  private readonly onEnergyChanged: () => void;

  constructor(
    private readonly postFX: PostFXContext,
    private readonly ambientLight: AmbientLight,
    private readonly sun: DirectionalLight,
    private readonly sky: SkySystemContext,
  ) {
    applyWorldLightingFromElevation(SUN_REVEAL.elevationNight, sun, ambientLight, sky);
    sunRevealState.elevationDeg = SUN_REVEAL.elevationNight;
    _revealPhase = 'idle';

    this.onEnergyChanged = () => {
      const energyRatio = Math.min(1, Math.max(0, state.energy / state.energyCap));

      if (!this.sunReveal.active) {
        this.postFX.setVignetteStrength(energyRatio);
      }

      if (state.energy >= state.energyCap && _revealPhase === 'idle') {
        this.sunReveal.active = true;
        _revealPhase = 'revealing';
        this.sunReveal.elapsed = 0;
      }

      checkWhisperAscension();
    };

    bus.on('energy:changed', this.onEnergyChanged);
  }

  update(dt: number): void {
    if (!this.sunReveal.active || _revealPhase === 'done') {
      return;
    }

    if (_revealPhase === 'revealing') {
      if (isDayCycleDevScrubLocked()) return;

      this.sunReveal.elapsed = Math.min(this.sunReveal.elapsed + dt, SUN_REVEAL.revealDuration);
      const t = this.sunReveal.elapsed / SUN_REVEAL.revealDuration;

      sunRevealState.elevationDeg = MathUtils.lerp(
        SUN_REVEAL.elevationNight,
        SUN_REVEAL.elevationDay,
        t,
      );
      applyWorldLightingFromElevation(
        sunRevealState.elevationDeg,
        this.sun,
        this.ambientLight,
        this.sky,
      );

      if (t >= 1) {
        sunRevealState.elevationDeg = SUN_REVEAL.elevationDay;
        _revealPhase = 'done';
        if (!this.vignetteDisabled) {
          this.postFX.setVignetteStrength(1.0);
          this.postFX.disableVignette();
          this.vignetteDisabled = true;
        }
      }
      return;
    }
  }

  dispose(): void {
    bus.off('energy:changed', this.onEnergyChanged);
  }
}

export function initWorldReveal(
  postFX: PostFXContext,
  ambientLight: AmbientLight,
  sun: DirectionalLight,
  sky: SkySystemContext,
): WorldRevealContext {
  return new WorldRevealController(postFX, ambientLight, sun, sky);
}
