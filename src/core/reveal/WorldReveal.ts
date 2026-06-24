// src/core/reveal/WorldReveal.ts — energy cap triggers day cycle (vignette + story beat)

import type { AmbientLight, DirectionalLight } from 'three';
import { PHASE0 } from '../../config/phase0';
import { VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';
import { applyWorldLightingFromElevation } from '../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { NIGHT_BASELINE_ELEVATION_DEG } from '../../rendering/sky/skyDefaults';
import { bus } from '../EventBus';
import { state } from '../GameState';

/** Animated sun position (degrees), shared with the game loop. */
export const sunRevealState: { elevationDeg: number; azimuthDeg: number } = {
  elevationDeg: NIGHT_BASELINE_ELEVATION_DEG,
  azimuthDeg: VISUAL.sky.cycle.azimuthEast,
};

let _revealPhase: 'idle' | 'done' = 'idle';

function checkWhisperAscension(): void {
  if (state.phase >= 1) return;
  if (state.energy < state.energyCap) return;
  state.phase = 1;
  bus.emit('memory:trigger', { id: PHASE0.AETHON_MEMORY_ID });
}

export function isSunRevealDone(): boolean {
  return _revealPhase === 'done';
}

export function getSunRevealPhase(): 'idle' | 'done' {
  return _revealPhase;
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
    _revealPhase = 'idle';

    this.onEnergyChanged = () => {
      const energyRatio = Math.min(1, Math.max(0, state.energy / state.energyCap));

      if (_revealPhase === 'idle') {
        this.postFX.setVignetteStrength(energyRatio);
      }

      if (state.energy >= state.energyCap && _revealPhase === 'idle') {
        _revealPhase = 'done';
        if (!this.vignetteDisabled) {
          this.postFX.setVignetteStrength(1.0);
          this.postFX.disableVignette();
          this.vignetteDisabled = true;
        }
      }

      checkWhisperAscension();
    };

    bus.on('energy:changed', this.onEnergyChanged);
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
