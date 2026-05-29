// src/rendering/nightHdriDebug.ts — DEV console traces for night HDRI weight
import { devSettings } from '../core/GameState';
import { getNightHdriTuning } from './nightHdriRuntime';
import {
  nightHdriWeightFromElevation,
  nightHdriWeightFromRevealProgress,
} from './nightHdriBlend';
import { getSunRevealPhase, getSunRevealProgress, sunRevealState } from './WorldReveal';

let lastLogKey = '';

export function logNightHdriFrame(gameplayWeight: number): void {
  if (!import.meta.env.DEV || !devSettings.renderDebug.logNightHdri) return;

  const phase = getSunRevealPhase();
  const revealT = getSunRevealProgress();
  const elev = sunRevealState.elevationDeg;
  const tuning = getNightHdriTuning();
  const weightFromElev = nightHdriWeightFromElevation(elev);
  const weightFromProgress = revealT !== null ? nightHdriWeightFromRevealProgress(revealT) : null;

  const revealBucket =
    revealT !== null ? Math.floor(revealT * 20) : phase === 'done' ? 99 : -1;
  const weightBucket = Math.floor(gameplayWeight * 20);
  const key = `${phase}|${revealBucket}|${weightBucket}`;

  if (key === lastLogKey) return;
  lastLogKey = key;

  console.info('[NightHDRI]', {
    phase,
    revealT,
    elevDeg: elev,
    gameplayWeight,
    preethamAlpha: 1 - gameplayWeight,
    weightFromElev,
    weightFromProgress,
    fadeStart: tuning.fadeElevationStart,
    fadeEnd: tuning.fadeElevationEnd,
    showHdri: gameplayWeight > 1e-4,
  });
}

export function resetNightHdriDebugLog(): void {
  lastLogKey = '';
}
