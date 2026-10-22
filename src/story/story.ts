// src/story/story.ts — the story lines the quest shows through the story log
//
// PLACEHOLDER TEXT. These lines only stand in until the story is written; they are all here, keyed by
// beat id, so replacing them touches nothing else. Each string is one card in the log (a few seconds).

export const STORY: Readonly<Record<string, readonly string[]>> = {
  'elder-meets': [
    '"An old man at the temple stops in the middle of his prayer. He turns, slowly, to the light beside you."',
    '"I felt something listening," Caros says, to no one. "Are you the one my mother prayed to?"',
    '"He cannot hear you, but he is not afraid. He asks the air to show the village it is not alone."',
  ],
  'convert-done': [
    '"Five of them now carry you in their thoughts. The others have started to look at the temple differently."',
  ],
  'fire-lit': [
    '"The temple fire burns at dusk, and the elder watches it as if it were an answer."',
  ],
  'offering-made': [
    '"Something of you has been given. The stones of the temple feel it, and so does he."',
  ],
  'village-converted': [
    '"Caros kneels at the temple door and says your name, not quite right. It does not matter. He believes."',
    '"Behind him, the village begins to build."',
  ],
};

/** Who speaks a line: the elder and Aera have a name on their card; the narrator has none. */
export type Speaker = 'caros' | 'aera';

export const SPEAKER_NAMES: Readonly<Record<Speaker, string>> = {
  caros: 'Caros',
  aera: 'Aera',
};

/** Spoken lines per beat id (PLACEHOLDER TEXT, like the story above): one card each, with the speaker's name. */
export const SPEECH: Readonly<Record<string, { speaker: Speaker; lines: readonly string[] }>> = {};

/** The lines of a beat and who says them (the narrator when the beat is not in `SPEECH`), or null for an unknown id. */
export function beatOf(id: string): { lines: readonly string[]; speaker?: Speaker } | null {
  const spoken = SPEECH[id];
  if (spoken) return spoken;
  const lines = STORY[id];
  return lines ? { lines } : null;
}
