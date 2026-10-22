// src/story/fragments.ts — the memory fragments: what the orb remembers as it gathers energy and wakes landmarks
// (text only; when each one is shown is decided in ui/StoryLog.ts, the PHASE0.STORY thresholds and the lists below)
// All of it is PLACEHOLDER story text: the author owns the final words (story-mechanics/PHASE_0_TODO.md).

import type { LandmarkKind } from '../map/MapTypes.ts';

export const MEMORY_FRAGMENTS: Record<number, string> = {
  1: '"You draw in the residue of old prayers. It feels like memory — not yours exactly. More like the impression a hand leaves in soft earth after it\'s been lifted away."',
  2: '"Faces. Thousands of them, upturned. They sang in a language that no longer exists. The sound of it felt like sunlight on bare stone."',
  3: '"You remember being vast. The mountains were your thoughts. The rivers were your blood. You were not worshipped — you simply were, and the world bent its attention toward you the way a plant bends toward light."',
  5: '"Something changed. Slowly, like winter. The prayers thinned. The songs stopped. You remember trying to hold on and finding nothing to grip — like trying to grasp at the last of the light before dark."',
  6: '"Her name was something like Merra. She came here every season. Brought a stone worn smooth from her palm. She never said a name. She just left it and walked away. You felt it land."',
  7: '"Verath. That name carries something sharp. A god of roads and commerce — young, ambitious, precise. He didn\'t destroy you. He simply offered something more useful, and the world is always grateful for the useful thing."',
  9: '"They built this wrong. The proportions were off, the carvings clumsy. They argued about it for years. It didn\'t matter. What mattered was the trying. You loved them for the trying."',
  10: '"The last worshipper was an old woman who died alone in a shepherd\'s hut. She whispered the old words into the dark — not because she believed they would work, but because her grandmother had taught them to her, and you hold onto the things the people you love teach you. That whisper is why you\'re here."',
  13: '"The last of the old places answers, and with it comes a direction: down to the water, where something small and warm has begun to stir. A village. People who hum a tune they cannot place, because their grandmothers hummed it. You are not only remembering. You are being remembered, a little, again."',
  14: '"She\'s saying your name. The shepherd girl at the ruin. She found it scratched into the stone and has been reciting it the way you recite a word you don\'t understand, feeling for the meaning in the sounds. She is very close to correct."',
  16: '"Your name is Aethon. You remember. It means: the one who was here before the naming of things. You remember a woman with grey hair and strong hands sitting at a loom in the dark. She was singing to you without knowing she was singing to you. The song had your name in it, folded into a melody so old it had stopped sounding like language. You remember thinking: this is enough. This is what it means to be a god. Not the temples. Not the ceremonies. This — a woman singing in the dark because the dark is less frightening when you fill it with sound."',
  17: '"The residue is whole, and still something is missing. Not here — out there, where the old places wait to be remembered."',
  18: '"Counting their prayers, the stones remember a time when every groove was a request and every request had a voice behind it. They remember being answered, and how little it took."',
  19: '"The tree remembers rain the way a body remembers a hand. It drank every year from the same cloud, and when the cloud stopped, it kept the shape of the thirst."',
  20: '"They built the temple without a plan, and you loved them for the trying. A roof that holds is only the second thing a temple needs. The first is somebody who comes back."',
  21: '"The water did not take the songs. It kept them, the way a bell keeps a note after the hand is gone, and gave them back to whoever stood still long enough."',
  23: '"A name is not a sound. It is a place in other people where you are kept. Tonight the place is full, and you are in it. You are Aethon, and they know it."',
  22: '"A girl lays her hand on a stone and says a word the wrong way, and the stone does what stones do with a wrong word said in earnest: it listens harder."',
};

/**
 * The chapter a landmark tells, by the order the player wakes them: the Nth landmark woken tells chapter N, so
 * any visiting order reads well. The last chapter turns towards the village.
 */
export const LANDMARK_CHAPTER_IDS = [2, 5, 6, 9, 13] as const;

/** The memory fragment the Nth woken landmark (1 for the first) tells. */
export function landmarkChapterId(order: number): number {
  const i = Math.min(Math.max(order, 1), LANDMARK_CHAPTER_IDS.length) - 1;
  return LANDMARK_CHAPTER_IDS[i];
}

/** A short line for each landmark kind, shown as it wakes (before its chapter). */
export const LANDMARK_CAPTIONS: Record<LandmarkKind, string> = {
  runestones: 'Runestones. Every groove still holds a prayer.',
  tree: 'An ancient tree. Its rings remember being looked at.',
  temple_ruin: 'A temple ruin, built with more love than skill.',
  sunken_ruin: 'A temple half drowned. The water kept the songs.',
  monolith: 'A single great stone, pointing at nothing but you.',
};

/** A short line for each landmark kind, shown when the village has restored it. */
export const LANDMARK_RESTORED_CAPTIONS: Record<LandmarkKind, string> = {
  runestones: 'The stones stand again. The wind has something to read.',
  tree: 'A shrine at the old tree. The rain remembers the way back.',
  temple_ruin: 'The temple has a roof. The builders hum when they pass it.',
  sunken_ruin: 'The water draws back from the ruin and leaves the songs behind.',
  monolith: 'Fires at the great stone. It points at the village now.',
};

/** The text of a memory fragment (shown by the story log, kept in the journal). */
export function memoryFragmentText(id: number): string | undefined {
  return MEMORY_FRAGMENTS[id];
}
