// src/ui/StoryLog.ts
import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { hasMemoryFragment, recordMemoryFragment, state } from '../core/GameState';
import { getLayer } from './kit/layers';

const { QUEUE_INTERVAL_MS, FADE_OUT_MS, ENERGY_THRESHOLDS } = PHASE0.STORY;

const MEMORY_FRAGMENTS: Record<number, string> = {
  1: '"You draw in the residue of old prayers. It feels like memory — not yours exactly. More like the impression a hand leaves in soft earth after it\'s been lifted away."',
  2: '"Faces. Thousands of them, upturned. They sang in a language that no longer exists. The sound of it felt like sunlight on bare stone."',
  3: '"You remember being vast. The mountains were your thoughts. The rivers were your blood. You were not worshipped — you simply were, and the world bent its attention toward you the way a plant bends toward light."',
  4: '"There are things that remember without minds. This tree grew in the direction your presence indicated. It has been pointing at you for three hundred years."',
  5: '"Something changed. Slowly, like winter. The prayers thinned. The songs stopped. You remember trying to hold on and finding nothing to grip — like trying to grasp at the last of the light before dark."',
  6: '"Her name was something like Merra. She came here every season. Brought a stone worn smooth from her palm. She never said a name. She just left it and walked away. You felt it land."',
  7: '"Verath. That name carries something sharp. A god of roads and commerce — young, ambitious, precise. He didn\'t destroy you. He simply offered something more useful, and the world is always grateful for the useful thing."',
  8: '"You had a name. You know that much. It was not one sound but several — a small sentence in an old language. It described what you were rather than labelled you. You cannot remember the sounds yet. Only the shape of them."',
  9: '"They built this wrong. The proportions were off, the carvings clumsy. They argued about it for years. It didn\'t matter. What mattered was the trying. You loved them for the trying."',
  10: '"The last worshipper was an old woman who died alone in a shepherd\'s hut. She whispered the old words into the dark — not because she believed they would work, but because her grandmother had taught them to her, and you hold onto the things the people you love teach you. That whisper is why you\'re here."',
  11: '"Someone built a pile of stones on a mountain approach and left them there. They didn\'t know why they felt the need to. You do. You always did."',
  12: '"Two syllables now. Something beginning with an open sound — a vowel, wide like a valley. The second shorter, harder. Like a decision being made."',
  13: '"There were other old gods before the young ones arrived. Not like you — you were always singular. You remember the feeling of their absence when they dissolved. The world felt slightly lighter each time. Less serious about itself."',
  14: '"She\'s saying your name. The shepherd girl at the ruin. She found it scratched into the stone and has been reciting it the way you recite a word you don\'t understand, feeling for the meaning in the sounds. She is very close to correct."',
  15: '"Five syllables. You have them all now. It does not sound the way you expected — not grand, not ancient. Softer than that. Almost gentle. Like something meant to be said quietly, close to the ground, between two people who already understand each other."',
  16: '"Your name is Aethon. You remember. It means: the one who was here before the naming of things. You remember a woman with grey hair and strong hands sitting at a loom in the dark. She was singing to you without knowing she was singing to you. The song had your name in it, folded into a melody so old it had stopped sounding like language. You remember thinking: this is enough. This is what it means to be a god. Not the temples. Not the ceremonies. This — a woman singing in the dark because the dark is less frightening when you fill it with sound."',
};

let logEl: HTMLDivElement;
let hideTimer = 0;
let fadeTimer = 0;
let showing = false;
/** What waits to be shown: a memory fragment (by id, recorded when shown) or a line of a story beat. */
type QueueItem = { fragment: number } | { line: string };
const fragmentQueue: QueueItem[] = [];

/** The text of a memory fragment, for the journal. */
export function memoryFragmentText(id: number): string | undefined {
  return MEMORY_FRAGMENTS[id];
}

function drainFragmentQueue(): void {
  if (showing || fragmentQueue.length === 0) return;
  const item = fragmentQueue.shift()!;
  const id = 'fragment' in item ? item.fragment : null;
  if (id !== null && hasMemoryFragment(id)) {
    drainFragmentQueue();
    return;
  }
  const text = 'fragment' in item ? MEMORY_FRAGMENTS[item.fragment] : item.line;
  if (!text) {
    drainFragmentQueue();
    return;
  }
  showing = true;
  if (id !== null) recordMemoryFragment(id);
  logEl.textContent = text;
  logEl.classList.add('visible');

  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    logEl.classList.remove('visible');
    fadeTimer = window.setTimeout(() => {
      showing = false;
      if (id !== null) bus.emit('story:fragmentEnded', { id });
      drainFragmentQueue();
    }, FADE_OUT_MS);
  }, QUEUE_INTERVAL_MS);
}

function showFragment(id: number): void {
  if (hasMemoryFragment(id)) return;
  if (!fragmentQueue.some((q) => 'fragment' in q && q.fragment === id))
    fragmentQueue.push({ fragment: id });
  drainFragmentQueue();
}

/** A story beat's lines, one card each, after whatever is showing. */
function showBeat(lines: readonly string[]): void {
  for (const line of lines) fragmentQueue.push({ line });
  drainFragmentQueue();
}

export function initStoryLog(): () => void {
  logEl = document.createElement('div');
  logEl.id = 'story-log';

  // Styled in kit/hud.css; the hud layer carries the z-index.
  getLayer('hud').appendChild(logEl);

  const onOrbAbsorbed = () => {
    if (hasMemoryFragment(1)) return;
    showFragment(1);
  };

  bus.on('orb:absorbed', onOrbAbsorbed);

  let lastEnergyTier = -1;

  const onEnergyChanged = () => {
    const pct = state.energy / state.energyCap;
    let tier = -1;
    for (let i = 0; i < ENERGY_THRESHOLDS.length; i++) {
      if (pct >= ENERGY_THRESHOLDS[i].pct) tier = i;
    }
    if (tier <= lastEnergyTier) return;
    lastEnergyTier = tier;
    for (let i = 0; i <= tier; i++) {
      const { fragmentId } = ENERGY_THRESHOLDS[i];
      if (!hasMemoryFragment(fragmentId)) showFragment(fragmentId);
    }
  };

  bus.on('energy:changed', onEnergyChanged);

  const onMemoryTrigger = (payload: { id: number }) => {
    showFragment(payload.id);
  };

  bus.on('memory:trigger', onMemoryTrigger);
  const offBeat = bus.on('story:beat', ({ lines }) => showBeat(lines));

  return () => {
    bus.off('orb:absorbed', onOrbAbsorbed);
    bus.off('energy:changed', onEnergyChanged);
    bus.off('memory:trigger', onMemoryTrigger);
    offBeat();
    window.clearTimeout(hideTimer);
    window.clearTimeout(fadeTimer);
    showing = false;
    fragmentQueue.length = 0;
    logEl.remove();
  };
}
