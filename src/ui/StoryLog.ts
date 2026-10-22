// src/ui/StoryLog.ts — shows memory fragments and story-beat lines, one card at a time
import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { state } from '../core/state/gameState';
import { hasMemoryFragment, recordMemoryFragment } from '../core/state/memoryFragments';
import { isLandmarkKind } from '../map/MapTypes';
import {
  LANDMARK_CAPTIONS,
  LANDMARK_RESTORED_CAPTIONS,
  landmarkChapterId,
  MEMORY_FRAGMENTS,
} from '../story/fragments';
import { getLayer } from './kit/layers';
import { type ContextualHud, createContextualHud } from './kit/visibility';

const { QUEUE_INTERVAL_MS, FADE_OUT_MS, ENERGY_THRESHOLDS } = PHASE0.STORY;

let logEl: HTMLDivElement;
let logHud: ContextualHud;
let hideTimer = 0;
let fadeTimer = 0;
let showing = false;
/** What waits to be shown: a memory fragment (by id, recorded when shown) or a line of a story beat. */
type QueueItem = { fragment: number } | { line: string };
const storyQueue: QueueItem[] = [];

function drainStoryQueue(): void {
  if (showing || storyQueue.length === 0) return;
  const item = storyQueue.shift()!;
  const id = 'fragment' in item ? item.fragment : null;
  if (id !== null && hasMemoryFragment(id)) {
    drainStoryQueue();
    return;
  }
  const text = 'fragment' in item ? MEMORY_FRAGMENTS[item.fragment] : item.line;
  if (!text) {
    drainStoryQueue();
    return;
  }
  showing = true;
  if (id !== null) recordMemoryFragment(id);
  logEl.textContent = text;
  logHud.setBase('persistent');

  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    logHud.setBase('hidden');
    fadeTimer = window.setTimeout(() => {
      showing = false;
      if (id !== null) bus.emit('story:fragmentEnded', { id });
      drainStoryQueue();
    }, FADE_OUT_MS);
  }, QUEUE_INTERVAL_MS);
}

function showFragment(id: number): void {
  if (hasMemoryFragment(id)) return;
  if (!storyQueue.some((q) => 'fragment' in q && q.fragment === id))
    storyQueue.push({ fragment: id });
  drainStoryQueue();
}

/** A story beat's lines, one card each, after whatever is showing. */
function showBeat(lines: readonly string[]): void {
  for (const line of lines) storyQueue.push({ line });
  drainStoryQueue();
}

export function initStoryLog(): () => void {
  logEl = document.createElement('div');
  logEl.id = 'story-log';

  // Styled in kit/hud.css; the hud layer carries the z-index.
  getLayer('hud').appendChild(logEl);
  logHud = createContextualHud(logEl, { base: 'hidden' });

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
  // A landmark wakes: its own caption, then the chapter of the story that is next in line.
  const offLandmark = bus.on('landmark:awakened', ({ kind, order }) => {
    if (isLandmarkKind(kind)) showBeat([LANDMARK_CAPTIONS[kind]]);
    showFragment(landmarkChapterId(order));
  });

  // The village restores a place: a closing line for it.
  const offRestored = bus.on('landmark:restored', ({ kind }) => {
    if (isLandmarkKind(kind)) showBeat([LANDMARK_RESTORED_CAPTIONS[kind]]);
  });

  return () => {
    bus.off('orb:absorbed', onOrbAbsorbed);
    bus.off('energy:changed', onEnergyChanged);
    bus.off('memory:trigger', onMemoryTrigger);
    offBeat();
    offLandmark();
    offRestored();
    window.clearTimeout(hideTimer);
    window.clearTimeout(fadeTimer);
    logHud.dispose();
    showing = false;
    storyQueue.length = 0;
    logEl.remove();
  };
}
