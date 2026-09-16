// src/rendering/sky/aurora/auroraRuntime.ts — live night aurora tunables
import { VISUAL } from '../../../config/visualTuning';

export interface AuroraTuning {
  enabled: boolean;
  intensity: number;
  auroraStrength: number;
  starStrength: number;
  timeScale: number;
}

function defaultsFromVisual(): AuroraTuning {
  const a = VISUAL.sky.nightAurora;
  return {
    enabled: a.enabled,
    intensity: a.intensity,
    auroraStrength: a.auroraStrength,
    starStrength: a.starStrength,
    timeScale: a.timeScale,
  };
}

let tuning = defaultsFromVisual();

export function getAuroraTuning(): Readonly<AuroraTuning> {
  return tuning;
}

export function setAuroraTuning(partial: Partial<AuroraTuning>): void {
  tuning = { ...tuning, ...partial };
}

export function resetAuroraTuning(): void {
  tuning = defaultsFromVisual();
}
