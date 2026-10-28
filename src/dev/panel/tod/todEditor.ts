// src/dev/panel/tod/todEditor.ts — what a Time-of-day stop editor is (the editors live next to this file)
import type { TodStopId } from '../../../config/visual/tod';
import type { PostFXContext } from '../../../rendering/PostFX';
import type { DayCycleDevContext } from '../sky/devPanelDayCycle';

export type DevPanelTodContext = DayCycleDevContext & {
  postFX: PostFXContext;
};

export interface TodEditorEnv {
  panel: HTMLDivElement;
  /** The Time-of-day section body its markup was mounted into. */
  body: HTMLElement;
  ctx?: DevPanelTodContext;
  /** The stop the editor reads and writes (follows the stop select). */
  stop: () => TodStopId;
}

export interface TodEditor {
  /** Read the selected stop's values into the controls. */
  sync: () => void;
  /** Put this editor's overrides back to the shipped values. */
  reset: () => void;
  dispose: () => void;
}
