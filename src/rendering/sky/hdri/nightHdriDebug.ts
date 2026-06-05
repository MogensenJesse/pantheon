// src/rendering/sky/hdri/nightHdriDebug.ts — DEV console traces for night HDRI weight
import { devSettings } from '../../../core/GameState';
import { getSunRevealPhase, sunRevealState } from '../../../core/reveal/WorldReveal';
import { nightHdriWeightFromElevation } from './nightHdriBlend';
import { getNightHdriTuning } from './nightHdriRuntime';

let lastLogKey = '';

export function logNightHdriFrame(gameplayWeight: number): void {
  if (!import.meta.env.DEV || !devSettings.renderDebug.logNightHdri) return;

  const phase = getSunRevealPhase();
  const elev = sunRevealState.elevationDeg;
  const tuning = getNightHdriTuning();
  const weightFromElev = nightHdriWeightFromElevation(elev);

  const elevBucket = Math.floor(elev * 2);
  const weightBucket = Math.floor(gameplayWeight * 20);
  const key = `${phase}|${elevBucket}|${weightBucket}`;

  if (key === lastLogKey) return;
  lastLogKey = key;

  console.info('[NightHDRI]', {
    phase,
    elevDeg: elev,
    gameplayWeight,
    preethamAlpha: 1 - gameplayWeight,
    weightFromElev,
    fadeStart: tuning.fadeElevationStart,
    fadeEnd: tuning.fadeElevationEnd,
    showHdri: gameplayWeight > 1e-4,
  });
}

export function resetNightHdriDebugLog(): void {
  lastLogKey = '';
}
