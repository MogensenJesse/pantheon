// src/core/reveal/WorldReveal.ts — energy cap triggers reveal sunrise, then day cycle

import type { AmbientLight, DirectionalLight } from 'three';
import { PHASE0 } from '../../config/phase0';
import { VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';
import { applyWorldLightingFromElevation } from '../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { NIGHT_BASELINE_ELEVATION_DEG } from '../../rendering/sky/skyDefaults';
import { bus } from '../EventBus';
import { getEnergyRatio } from '../energy';
import { state } from '../GameState';
import { isEnergyCapReached, markEnergyCapReached, resetRevealPhase } from './revealPhase';
import { sunRevealState } from './sunRevealState';

export {
  isEnergyCapReached,
  isRevealSunriseInProgress,
  isSunRevealDone,
  markSunRevealIntroComplete,
  setRevealSunriseInProgress,
} from './revealPhase';

let activeReveal: WorldRevealController | null = null;

function triggerWhisperAscension(): void {
  if (state.phase >= 1) return;
  state.phase = 1;
  bus.emit('memory:trigger', { id: PHASE0.AETHON_MEMORY_ID });
}

export interface WorldRevealContext {
  dispose: () => void;
}

class WorldRevealController implements WorldRevealContext {
  private readonly onEnergyChanged: () => void;

  constructor(
    private readonly postFX: PostFXContext,
    ambientLight: AmbientLight,
    sun: DirectionalLight,
    sky: SkySystemContext,
  ) {
    activeReveal = this;
    resetRevealPhase();

    applyWorldLightingFromElevation(NIGHT_BASELINE_ELEVATION_DEG, sun, ambientLight, sky);
    sunRevealState.elevationDeg = NIGHT_BASELINE_ELEVATION_DEG;
    sunRevealState.azimuthDeg = VISUAL.sky.cycle.azimuthEast;

    this.onEnergyChanged = () => {
      const energyRatio = getEnergyRatio();

      if (!isEnergyCapReached()) {
        this.postFX.setVignetteStrength(energyRatio);
      }

      if (state.energy >= state.energyCap && !isEnergyCapReached()) {
        markEnergyCapReached();
        this.postFX.setVignetteStrength(1.0);
        this.postFX.disableVignette();
        triggerWhisperAscension();
      }
    };

    bus.on('energy:changed', this.onEnergyChanged);

    if (state.energy >= state.energyCap) {
      this.onEnergyChanged();
    }
  }

  dispose(): void {
    bus.off('energy:changed', this.onEnergyChanged);
    if (activeReveal === this) {
      activeReveal = null;
      resetRevealPhase();
    }
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
