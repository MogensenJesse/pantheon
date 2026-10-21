// src/core/reveal/WorldReveal.ts — a full bar and every landmark awake trigger the reveal sunrise, then the day cycle

import type { AmbientLight, DirectionalLight } from 'three';
import { PHASE0 } from '../../config/phase0';
import { VISUAL } from '../../config/visualTuning';
import { applyWorldLightingFromElevation } from '../../rendering/sky/lightingCurves';
import type { SkySystemContext } from '../../rendering/sky/SkySystem';
import { NIGHT_BASELINE_ELEVATION_DEG } from '../../rendering/sky/skyDefaults';
import { bus } from '../EventBus';
import { state } from '../state/gameState';
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

/** What else must hold, beside the full bar, before the sun rises: every landmark of the map is awake. */
export interface Phase0Gate {
  allAwake: () => boolean;
}

class WorldRevealController implements WorldRevealContext {
  private readonly onEnergyChanged: () => void;

  constructor(
    private readonly ambientLight: AmbientLight,
    private readonly sun: DirectionalLight,
    private readonly sky: SkySystemContext,
    private readonly gate: Phase0Gate,
  ) {
    activeReveal = this;
    resetRevealPhase();

    applyWorldLightingFromElevation(NIGHT_BASELINE_ELEVATION_DEG, sun, ambientLight, sky);
    sunRevealState.elevationDeg = NIGHT_BASELINE_ELEVATION_DEG;
    sunRevealState.azimuthDeg = VISUAL.sky.cycle.azimuthEast;

    this.onEnergyChanged = () => {
      if (!isEnergyCapReached()) {
        // Orb lift updates sun/ambient/daylight here; post-FX/sky exposure sync via applySkyForReveal each frame.
        applyWorldLightingFromElevation(
          NIGHT_BASELINE_ELEVATION_DEG,
          this.sun,
          this.ambientLight,
          this.sky,
        );
      }

      if (state.energy >= state.energyCap && !isEnergyCapReached()) {
        if (this.gate.allAwake()) {
          markEnergyCapReached();
          triggerWhisperAscension();
        } else {
          // The bar is full but landmarks are left: the story says so (shown once; a seen fragment is skipped).
          bus.emit('memory:trigger', { id: PHASE0.UNFINISHED_MEMORY_ID });
        }
      }
    };

    bus.on('energy:changed', this.onEnergyChanged);
    // The last landmark can wake with the bar already full.
    bus.on('landmark:awakened', this.onEnergyChanged);

    if (state.energy >= state.energyCap) {
      this.onEnergyChanged();
    }
  }

  dispose(): void {
    bus.off('energy:changed', this.onEnergyChanged);
    bus.off('landmark:awakened', this.onEnergyChanged);
    if (activeReveal === this) {
      activeReveal = null;
      resetRevealPhase();
    }
  }
}

export function initWorldReveal(
  ambientLight: AmbientLight,
  sun: DirectionalLight,
  sky: SkySystemContext,
  gate: Phase0Gate,
): WorldRevealContext {
  return new WorldRevealController(ambientLight, sun, sky, gate);
}
