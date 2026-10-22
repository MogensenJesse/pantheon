// src/quests/restorationGoals.ts — the restoration of the places of power as the player reads it: the objective
// line (pure, node-runnable; story-mechanics/PHASE_2_RESTORATION.md)

import { VILLAGE } from '../config/village.ts';
import {
  canStartRestoration,
  isAwake,
  type LandmarkPlace,
  type LandmarkState,
  restorationOf,
} from '../landmarks/landmarks.ts';
import type { LandmarkKind } from '../map/MapTypes.ts';
import type { Objective } from './quest.ts';

export const LANDMARK_NAMES: Record<LandmarkKind, string> = {
  runestones: 'the standing stones',
  tree: 'the old tree',
  temple_ruin: 'the ruined temple',
  sunken_ruin: 'the sunken ruin',
  monolith: 'the monolith',
};

export interface RestorationGoalsView {
  places: readonly LandmarkPlace[];
  state: LandmarkState;
  converted: boolean;
  /** Wood in the store. */
  wood: number;
  /** A place's remote site: its stage and the work into that stage; null before a crew goes. */
  site: (kind: LandmarkKind) => { stage: 0 | 1 | 2; progress: number } | null;
}

/** How far a remote site has come, 0 to 1. */
export function siteFraction(stage: 0 | 1 | 2, progress: number): number {
  const work = VILLAGE.RESTORATION.SITE_WORK_S;
  const total = work[0] + work[1];
  if (stage >= 2) return 1;
  const done = stage === 1 ? work[0] : 0;
  return Math.min(1, (done + progress) / total);
}

/** The objective line for the places the player has woken. Nothing before the village converts. */
export function restorationGoals(view: RestorationGoalsView): { objective: Objective | null } {
  if (!view.converted) return { objective: null };
  let objective: Objective | null = null;
  const { START_WOOD } = VILLAGE.RESTORATION;
  for (const kind of view.state.awakened) {
    if (!view.places.some((p) => p.kind === kind) || !isAwake(view.state, kind)) continue;
    const name = LANDMARK_NAMES[kind];
    const status = restorationOf(view.state, kind);
    if (status === 'inProgress') {
      const site = view.site(kind);
      const percent = site ? Math.floor(siteFraction(site.stage, site.progress) * 100) : 0;
      objective ??= { text: `The builders are restoring ${name}  ${percent}%` };
    } else if (canStartRestoration(view.state, kind, true)) {
      objective ??= {
        text:
          view.wood < START_WOOD
            ? `Gather ${START_WOOD} wood to restore ${name}`
            : `Stand at ${name} to restore it`,
      };
    }
  }
  return { objective };
}
