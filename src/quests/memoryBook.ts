// src/quests/memoryBook.ts — the memory book the player opens with J (pure, node-runnable)
//
// No to-do list. The book keeps what the orb remembers (the memory fragments found), the places of power it
// has woken and what became of them, and the milestones the village has reached. Its cover is the rune:
// outlined from the start, a stroke filling for each place the village restores, whole once the name returns.

import { LANDMARK_EFFECTS } from '../landmarks/landmarkEffects.ts';
import { type LandmarkPlace, type LandmarkState, restorationOf } from '../landmarks/landmarks.ts';
import { LANDMARK_KINDS, type LandmarkKind } from '../map/MapTypes.ts';
import { milestoneLabel } from '../skills/milestones.ts';
import type { ModifierEffect } from '../skills/modifiers.ts';
import { describeEffect } from '../skills/skillView.ts';
import {
  LANDMARK_CAPTIONS,
  LANDMARK_RESTORED_CAPTIONS,
  memoryFragmentText,
} from '../story/fragments.ts';

export interface BookPlace {
  kind: LandmarkKind;
  caption: string;
  status: 'awake' | 'restoring' | 'restored';
  /** The closing line, once the place is restored. */
  restoredCaption?: string;
  /** What the place does for the village: its weight while it lies waiting, its gift once restored. */
  effect: string;
}

const describe = (effects: readonly ModifierEffect[]): string =>
  effects.map(describeEffect).join(', ');

export interface MemoryBook {
  /** One stroke of the rune per kind of place, lit when that place is restored (all lit once the name returns). */
  rune: { kind: LandmarkKind; lit: boolean }[];
  /** The rune is whole: the name has returned. */
  nameReturned: boolean;
  memories: { id: number; text: string }[];
  places: BookPlace[];
  milestones: string[];
}

export interface MemoryBookView {
  fragments: readonly number[];
  places: readonly LandmarkPlace[];
  landmarks: LandmarkState;
  milestones: readonly string[];
  /** The finale is done (Q6); false until then. */
  nameReturned: boolean;
}

export function memoryBookOf(view: MemoryBookView): MemoryBook {
  const here = (kind: LandmarkKind) => view.places.some((p) => p.kind === kind);
  const places: BookPlace[] = [];
  for (const kind of view.landmarks.awakened) {
    if (!here(kind)) continue;
    const status = restorationOf(view.landmarks, kind);
    places.push({
      kind,
      caption: LANDMARK_CAPTIONS[kind],
      status: status === 'restored' ? 'restored' : status === 'inProgress' ? 'restoring' : 'awake',
      ...(status === 'restored' ? { restoredCaption: LANDMARK_RESTORED_CAPTIONS[kind] } : {}),
      effect: describe(
        status === 'restored' ? LANDMARK_EFFECTS[kind].boon : LANDMARK_EFFECTS[kind].hurdle,
      ),
    });
  }
  return {
    rune: LANDMARK_KINDS.map((kind) => ({
      kind,
      lit: view.nameReturned || restorationOf(view.landmarks, kind) === 'restored',
    })),
    nameReturned: view.nameReturned,
    memories: [...new Set(view.fragments)]
      .sort((a, b) => a - b)
      .flatMap((id) => {
        const text = memoryFragmentText(id);
        return text ? [{ id, text }] : [];
      }),
    places,
    milestones: view.milestones.map(milestoneLabel),
  };
}
