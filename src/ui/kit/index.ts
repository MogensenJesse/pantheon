// src/ui/kit/index.ts — the UI kit: tokens, icons, layers, panels, notifications, tooltips, settings
//
// Screens build on this instead of injecting their own styles: tokens.css (linked in index.html) holds
// the colours, sizes, motion and layers; kit.css the components; hud.css the HUD pieces. See the UI
// section of story-mechanics/VILLAGE_ROADMAP.md for the principles.
import './kit.css';
import './hud.css';
import { listHotkeys, registerHotkey } from './hotkeys';
import { disposeUiRoot, ensureUiRoot } from './layers';
import { disposeNotifications, notify } from './notify';
import { disposePanels } from './panels';
import { applyUiSettings, getUiSettings, updateUiSettings } from './settings';
import { openSettingsPanel, toggleSettingsPanel } from './settingsPanel';
import { disposeTooltip } from './tooltip';

export { append, type Child, type ElProps, h } from './dom';
export { listHotkeys, registerHotkey } from './hotkeys';
export { ICON_NAMES, type IconName, type IconOptions, icon } from './icons';
export { getLayer, type LayerName } from './layers';
export { dismissNotification, type NotifyInput, type NotifyKind, notify } from './notify';
export {
  closePanel,
  closeTopPanel,
  isPanelOpen,
  openPanel,
  type PanelHandle,
  type PanelOptions,
} from './panels';
export { getUiSettings, subscribeUiSettings, type UiSettings, updateUiSettings } from './settings';
export { openSettingsPanel } from './settingsPanel';
export { attachTooltip, type TooltipContent } from './tooltip';
export {
  type ContextualHud,
  type ContextualHudOptions,
  createContextualHud,
  type HudBaseState,
  type HudState,
} from './visibility';

/** Mounts the layers, applies the saved settings and binds the kit's own hotkeys. Returns the teardown. */
export function initUiKit(): () => void {
  applyUiSettings();
  ensureUiRoot();
  const offSettingsKey = registerHotkey('KeyO', toggleSettingsPanel, 'Settings');
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__pantheonUi = {
      openSettings: openSettingsPanel,
      notify,
      settings: getUiSettings,
      update: updateUiSettings,
      hotkeys: listHotkeys,
    };
  }
  return () => {
    offSettingsKey();
    disposePanels();
    disposeNotifications();
    disposeTooltip();
    disposeUiRoot();
    if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__pantheonUi;
  };
}
