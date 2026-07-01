// src/core/reveal/WorldReveal.ts — energy cap triggers reveal sunrise, then day cycle

import type { AmbientLight, DirectionalLight } from 'three';
import { PHASE0 } from '../../config/phase0';
import { VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';
import { applyWorldLightingFromElevation } from '../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { NIGHT_BASELINE_ELEVATION_DEG } from '../../rendering/sky/skyDefaults';
import { bus } from '../EventBus';
import { state } from '../GameState';
import { sunRevealState } from './sunRevealState';

export { sunRevealState };

let _energyCapReached = false;
let _sunRevealIntroComplete = false;
let _revealSunriseInProgress = false;

function checkWhisperAscension(): void {
  if (state.phase >= 1) return;
  if (state.energy < state.energyCap) return;
  state.phase = 1;
  bus.emit('memory:trigger', { id: PHASE0.AETHON_MEMORY_ID });
}

/** Player reached 100% energy — reveal sunrise may run. */
export function isEnergyCapReached(): boolean {
  return _energyCapReached;
}

/** Post-cap reveal sunrise finished — looping day cycle is authoritative. */
export function isSunRevealDone(): boolean {
  return _sunRevealIntroComplete;
}

/** True during the one-shot reveal sunrise animation. */
export function isRevealSunriseInProgress(): boolean {
  return _revealSunriseInProgress;
}

export function setRevealSunriseInProgress(active: boolean): void {
  _revealSunriseInProgress = active;
}

export function markSunRevealIntroComplete(): void {
  _sunRevealIntroComplete = true;
  _revealSunriseInProgress = false;
}

export function getSunRevealPhase(): 'idle' | 'cap' | 'done' {
  if (_sunRevealIntroComplete) return 'done';
  if (_energyCapReached) return 'cap';
  return 'idle';
}

export interface WorldRevealContext {
  update: (_dt: number) => void;
  dispose: () => void;
}

class WorldRevealController implements WorldRevealContext {
  private vignetteDisabled = false;
  private readonly onEnergyChanged: () => void;

  constructor(
    private readonly postFX: PostFXContext,
    ambientLight: AmbientLight,
    sun: DirectionalLight,
    sky: SkySystemContext,
  ) {
    applyWorldLightingFromElevation(NIGHT_BASELINE_ELEVATION_DEG, sun, ambientLight, sky);
    sunRevealState.elevationDeg = NIGHT_BASELINE_ELEVATION_DEG;
    sunRevealState.azimuthDeg = VISUAL.sky.cycle.azimuthEast;
    _energyCapReached = false;
    _sunRevealIntroComplete = false;
    _revealSunriseInProgress = false;

    this.onEnergyChanged = () => {
      const energyRatio = Math.min(1, Math.max(0, state.energy / state.energyCap));

      if (!_energyCapReached) {
        this.postFX.setVignetteStrength(energyRatio);
      }

      if (state.energy >= state.energyCap && !_energyCapReached) {
        _energyCapReached = true;
        if (!this.vignetteDisabled) {
          this.postFX.setVignetteStrength(1.0);
          this.postFX.disableVignette();
          this.vignetteDisabled = true;
        }
      }

      checkWhisperAscension();
    };

    bus.on('energy:changed', this.onEnergyChanged);

    if (state.energy >= state.energyCap) {
      this.onEnergyChanged();
    }
  }

  update(_dt: number): void {}

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
