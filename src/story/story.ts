// src/story/story.ts — the story lines the quests show through the story log
//
// PLACEHOLDER TEXT. These lines only stand in until the story is written; they are all here, keyed by
// beat id, so replacing them touches nothing else. Each string is one card in the log (a few seconds).
// A beat with a `speaker` is said by a character (their name is on the card); one without is the old god's
// own narration.

/** Who speaks a line: the elder and Aera have a name on their card; the narrator has none. */
export type Speaker = 'caros' | 'aera';

export const SPEAKER_NAMES: Readonly<Record<Speaker, string>> = {
  caros: 'Caros',
  aera: 'Aera',
};

export interface Beat {
  speaker?: Speaker;
  lines: readonly string[];
}

export const BEATS: Readonly<Record<string, Beat>> = {
  'elder-meets': {
    lines: [
      '"An old man at the temple stops in the middle of his prayer. He turns, slowly, to the light beside you."',
      '"I felt something listening," Caros says, to no one. "Are you the one my mother prayed to?"',
      '"He cannot hear you, but he is not afraid. He asks the air to show the village it is not alone."',
    ],
  },
  'convert-done': {
    lines: [
      '"Five of them now carry you in their thoughts. The others have started to look at the temple differently."',
    ],
  },
  'fire-lit': {
    lines: ['"The temple fire burns at dusk, and the elder watches it as if it were an answer."'],
  },
  'offering-made': {
    lines: ['"Something of you has been given. The stones of the temple feel it, and so does he."'],
  },
  'village-converted': {
    lines: [
      '"Caros kneels at the temple door and says your name, not quite right. It does not matter. He believes."',
      '"Behind him, the village begins to build."',
    ],
  },
  'first-roof-ask': {
    speaker: 'caros',
    lines: [
      'We have ten roofs and no room for the next family. If you can reach the builders, show them where a new house should stand.',
    ],
  },
  'first-roof-done': {
    speaker: 'caros',
    lines: ['A new house on the ground you chose. The builders hardly needed telling twice.'],
  },
  'prayer-heard-ask': {
    speaker: 'caros',
    lines: ['Someone is praying to you, not to the temple. Go to them, and see what they need.'],
  },
  'prayer-heard-done': {
    speaker: 'caros',
    lines: ['She stopped praying and started humming. That is how I know it was heard.'],
  },
  'the-touch-ask': {
    speaker: 'caros',
    lines: [
      'Some of us have lost the way back. A hand on the shoulder is worth more than a sermon. Try it.',
    ],
  },
  'the-touch-done': {
    speaker: 'caros',
    lines: ['He stood up straighter. Whatever you did, it is a kind of mending.'],
  },
  'raised-ask': {
    speaker: 'caros',
    lines: [
      'A house can be more than a house. Give the builders wood and time, and one of ours can be raised a floor.',
    ],
  },
  'raised-done': {
    speaker: 'caros',
    lines: ['Look at it. We built that, and then we built it again, better.'],
  },
  'first-place-ask': {
    speaker: 'caros',
    lines: [
      'There are old places that remember you. If the village restores one, the whole land will notice.',
    ],
  },
  'first-place-done': {
    speaker: 'caros',
    lines: ['One of the old places stands again. I did not think I would live to see it.'],
  },
  'beyond-fence-ask': {
    speaker: 'caros',
    lines: [
      'The trees are far and the water is farther. A camp beyond the fence would feed us, if you show the crew where.',
    ],
  },
  'beyond-fence-done': {
    speaker: 'caros',
    lines: ['A smoke on the far ridge. The first of ours who sleeps beyond the fence.'],
  },
  'hard-winter-ask': {
    speaker: 'caros',
    lines: ['The larder is empty. Whatever else you do, keep us fed.'],
  },
  'hard-winter-done': {
    speaker: 'caros',
    lines: ['We ate. We will remember who made that possible.'],
  },
  'many-hands-ask': {
    speaker: 'caros',
    lines: [
      'There are more of us each season. Twenty souls would make us a village, and not a hamlet.',
    ],
  },
  'many-hands-done': {
    speaker: 'caros',
    lines: ['Twenty. I counted them twice. This is a village.'],
  },
  'finale-call': {
    speaker: 'caros',
    lines: [
      'Five old places stand again. Tonight, at dusk, let the whole village gather at the temple.',
    ],
  },
  'finale-done': {
    speaker: 'caros',
    lines: [
      'There. It is written in the sky, and nobody has to say it for us to know it.',
      'A trader passed on the road this morning, asking after the temple. He knew the name of every god but yours.',
    ],
  },
  'favour-runestones-ask': {
    speaker: 'caros',
    lines: [
      'The winter of thinning prayers is in those stones. Answer three prayers of ours, and let them read that the prayers are heard again.',
    ],
  },
  'favour-runestones-done': {
    speaker: 'caros',
    lines: ['The stones are quiet now, the way a held breath is quiet.'],
  },
  'favour-tree-ask': {
    speaker: 'caros',
    lines: [
      'The old tree stood through dry summers when the sky forgot us. When we pray for rain, answer one, and let the tree remember.',
    ],
  },
  'favour-tree-done': {
    speaker: 'caros',
    lines: ['The leaves moved when the rain came. It was like being forgiven.'],
  },
  'favour-temple_ruin-ask': {
    speaker: 'caros',
    lines: [
      'Whoever built that temple built it with love and no skill. Raise one of our houses a floor, and show them what skill can do.',
    ],
  },
  'favour-temple_ruin-done': {
    speaker: 'caros',
    lines: ['A better roof, in a village that learned from a badly built temple.'],
  },
  'favour-sunken_ruin-ask': {
    speaker: 'caros',
    lines: [
      'The water kept the songs. Put a fishing hut on its shore, and let us listen while we work.',
    ],
  },
  'favour-sunken_ruin-done': {
    speaker: 'caros',
    lines: ['The fishermen hum while they mend the nets. Nobody taught them the tune.'],
  },
  'favour-monolith-ask': {
    speaker: 'caros',
    lines: [
      'The shepherd girl, Aera, says your name nearly right. Lay a hand on her, and the great stone will know.',
    ],
  },
  'favour-monolith-done': {
    speaker: 'aera',
    lines: ['I dreamed of a long road. Someone was waiting at the end of it.'],
  },
};

/** What the story log is told for a beat: its lines and, for a spoken one, the speaker's name; null for an unknown id. */
export function beatPayload(
  id: string,
): { id: string; lines: readonly string[]; speaker?: string } | null {
  const beat = BEATS[id];
  if (!beat) return null;
  return beat.speaker
    ? { id, lines: beat.lines, speaker: SPEAKER_NAMES[beat.speaker] }
    : { id, lines: beat.lines };
}
