// src/world/village/render/crownTuning.ts — live copy of the temple beacon look: the DEV panel writes it, the renderers read it every frame
import { VISUAL } from '../../../config/visualTuning';

export interface CrownTuning {
  /** Orb size at 100% (x the player's full-energy orb). */
  orbScale: number;
  /** Thin beam: brightness and half width at its strongest, fade-in length above the orb (m), idle level between pulses. */
  beamHdrMax: number;
  beamHalfWidthMax: number;
  beamFadeM: number;
  beamPulseIdle: number;
  /** Light column: brightness and radii at full growth, breathing speed (rad/s) and depth, idle level between bands. */
  columnHdrMax: number;
  columnBaseRadiusMax: number;
  columnTopRadiusMax: number;
  columnBreathSpeed: number;
  columnBreathAmount: number;
  columnPulseIdle: number;
}

function defaults(): CrownTuning {
  const { CROWN_ORB: orb, CROWN_BEAM: beam, CROWN_COLUMN: column } = VISUAL.village;
  return {
    orbScale: orb.SCALE,
    beamHdrMax: beam.HDR.MAX,
    beamHalfWidthMax: beam.HALF_WIDTH_M.MAX,
    beamFadeM: beam.FADE_M,
    beamPulseIdle: beam.PULSE.IDLE,
    columnHdrMax: column.HDR.MAX,
    columnBaseRadiusMax: column.BASE_RADIUS_M.MAX,
    columnTopRadiusMax: column.TOP_RADIUS_M.MAX,
    columnBreathSpeed: column.BREATH.SPEED,
    columnBreathAmount: column.BREATH.AMOUNT,
    columnPulseIdle: column.PULSE.IDLE,
  };
}

export const crownTuning: CrownTuning = defaults();

export function resetCrownTuning(): void {
  Object.assign(crownTuning, defaults());
}
