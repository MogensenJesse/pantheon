// src/world/village/sim/construction.ts — turns builder work into stage progress
import { VILLAGE } from '../../../config/village.ts';
import type { VillageStage } from '../model/assetKeys.ts';
import type { Building } from '../model/types.ts';

export interface StageCompleted {
  building: Building;
  stage: VillageStage;
}

/** Builder-seconds the phase after `stage` takes; a finished building needs none. */
function workFor(stage: VillageStage): number {
  return stage === 2 ? Number.POSITIVE_INFINITY : VILLAGE.CONSTRUCTION.WORK_S[stage];
}

export function isOpenSite(building: Building): boolean {
  return building.stage < 2;
}

/** The work (builder-seconds) the current stage of a site still needs; 0 for a finished building. */
export function remainingWork(site: Building): number {
  return site.stage >= 2 ? 0 : Math.max(0, workFor(site.stage) - site.progress);
}

/**
 * Add `workSeconds` of builder work to a site. Finishing a stage's work moves it to the next
 * stage; leftover work carries over. Returns the stages completed (usually zero or one).
 */
export function applyWork(site: Building, workSeconds: number): StageCompleted[] {
  const done: StageCompleted[] = [];
  site.progress += workSeconds;
  while (site.stage < 2 && site.progress >= workFor(site.stage)) {
    site.progress -= workFor(site.stage);
    site.stage = (site.stage + 1) as VillageStage;
    done.push({ building: site, stage: site.stage });
  }
  if (site.stage === 2) site.progress = 0;
  return done;
}
