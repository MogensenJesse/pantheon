// src/save/setupSaving.ts — the save system in the running game: what a save captures, the autosaver and
// its indicator, the pause menu, "Press E to save" at the temple, and when the pause menu opens
//
// `main.ts` hands over the game's parts; this builds the rest. The quest is looked up when a save is
// taken, because a village without one saves a finished quest.

import { PHASE0 } from '../config/phase0';
import type { CameraInputContext } from '../core/CameraInput';
import { GameLoop } from '../core/GameLoop';
import type { FrameClocks } from '../core/gameTick';
import type { DayCycleContext } from '../core/reveal/DayCycle';
import { state } from '../core/state/gameState';
import type { OrbSystemContext } from '../entities/energyOrb/orbSystem';
import type { PlayerControllerContext } from '../entities/PlayerController';
import { CONVERSION_QUEST, finishedQuestState, type QuestState } from '../quests/quest';
import { getActiveCycle } from '../rendering/sky/lightingCurves';
import type { SkillRuntime } from '../skills/skillRuntime';
import { isPanelOpen, notify, registerHotkey, setPanelPauseHandler } from '../ui/kit';
import { pauseOnKey, pauseOnLockChange } from '../ui/pauseRules';
import {
  createAutosaveIndicator,
  createPauseMenu,
  initTempleSave,
  openSlotPanel,
} from '../ui/saves';
import { templeOf } from '../world/village/model/buildings';
import type { VillageSystemContext } from '../world/village/VillageSystem';
import { captureGame, createAutosaver, createPlayClock } from './gameSave';
import { loadUrl, type SaveRequest, startScreenUrl } from './saveRequest';
import type { SaveService } from './saveService';
import type { SaveStore } from './store';

export interface SavingDeps {
  store: SaveStore;
  service: SaveService;
  request: SaveRequest;
  /** Seconds already played in the save being continued. */
  playSecondsAtStart: number;
  dayCycle: DayCycleContext;
  player: PlayerControllerContext;
  lookInput: CameraInputContext;
  orbSystem: OrbSystemContext;
  skills: SkillRuntime;
  /** The conversion quest's state, or null where there is no quest. */
  questState: () => QuestState | null;
  clocks: () => FrameClocks;
  village: VillageSystemContext | null;
  /** False while something owns the mouse and the lock is released on purpose (the village overview). */
  canPause?: () => boolean;
}

export interface Saving {
  capture: () => ReturnType<typeof captureGame>;
  saver: ReturnType<typeof createAutosaver>;
  pauseMenu: ReturnType<typeof createPauseMenu>;
  /** The game is running: from now on the pause menu may open. */
  setRunning: () => void;
  dispose: () => void;
}

export function setupSaving(deps: SavingDeps): Saving {
  const playClock = createPlayClock(deps.playSecondsAtStart);
  const capture = () =>
    captureGame({
      game: state,
      dayCycle: deps.dayCycle,
      player: deps.player,
      camera: deps.lookInput,
      orbs: deps.orbSystem,
      skills: deps.skills,
      quest: { state: () => deps.questState() ?? finishedQuestState(CONVERSION_QUEST) },
      clocks: deps.clocks,
      village: deps.village,
      dayDurationSec: () => getActiveCycle().dayDurationSec,
      playSeconds: playClock.seconds,
    });

  const indicator = createAutosaveIndicator();
  // Registered before the page's teardown, so a leaving page is captured before it is taken apart.
  const saver = createAutosaver({
    service: deps.service,
    capture,
    automatic: deps.request.autosave,
    onStart: () => indicator.start(),
    onSaved: (meta, kind) => {
      indicator.end();
      if (kind === 'manual') {
        notify({ text: `Game saved (${meta.id.replace('manual-', 'slot ')})`, kind: 'success' });
      }
    },
    onError: (err) => {
      indicator.end();
      console.error('[save]', err);
      notify({
        text: err instanceof Error ? err.message : 'Could not save the game.',
        kind: 'warning',
      });
    },
  });

  // Panels that pause the world (the pause menu, the skill tree, the journal) freeze the loop and the
  // play clock together.
  setPanelPauseHandler((paused) => {
    GameLoop.setPaused(paused);
    playClock.setPaused(paused);
  });
  const listSlots = () => deps.store.list();
  /** The list of slots to save into (the pause menu and the temple both open it). */
  const openSavePanel = () =>
    openSlotPanel({
      mode: 'save',
      listSlots,
      onChoose: async (id) => {
        await saver.saveNow(id);
        return true;
      },
    });
  // The page is on its way out: stop drawing, so the next one is not starved while it loads.
  const leaveFor = (url: string) => {
    GameLoop.stop();
    window.location.assign(url);
  };
  const pauseMenu = createPauseMenu({
    listSlots,
    deleteSlot: (id) => deps.store.remove(id),
    openSavePanel,
    loadSlot: (id) => leaveFor(loadUrl(window.location.href, id)),
    quitToStart: async () => {
      await saver.saveNow();
      leaveFor(startScreenUrl(window.location.href));
    },
  });

  const temple = deps.village ? templeOf(deps.village.sim.buildings) : undefined;
  const disposeTempleSave = temple
    ? initTempleSave({
        playerPosition: () => deps.player.position,
        temple: {
          x: temple.x,
          z: temple.z,
          reachM: Math.hypot(temple.halfW, temple.halfD) + PHASE0.TEMPLE_SAVE.REACH_M,
        },
        openSavePanel,
      })
    : () => {};

  // When the pause menu opens (see ui/pauseRules.ts): Esc with the mouse free, or the lock being lost.
  let running = false;
  const pauseContext = () => ({
    ready: running && (deps.canPause?.() ?? true),
    panelOpen: isPanelOpen(),
  });
  const mouseLocked = () => document.pointerLockElement !== null;
  let wasLocked = mouseLocked();
  const offPauseKey = registerHotkey(
    'Escape',
    () => {
      if (pauseOnKey('Escape', mouseLocked(), pauseContext())) pauseMenu.open();
    },
    'Pause',
  );
  const onLockChange = () => {
    const locked = mouseLocked();
    const open = pauseOnLockChange(wasLocked, locked, pauseContext());
    wasLocked = locked;
    if (open) pauseMenu.open();
  };
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    capture,
    saver,
    pauseMenu,
    setRunning: () => {
      running = true;
    },
    dispose: () => {
      setPanelPauseHandler(null);
      saver.dispose();
      playClock.dispose();
      indicator.dispose();
      disposeTempleSave();
      offPauseKey();
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}
