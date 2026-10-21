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
