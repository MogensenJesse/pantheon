// src/ui/kit/index.ts — the UI kit: tokens, icons, layers, panels, notifications, tooltips, settings
//
// Screens build on this instead of injecting their own styles: tokens.css (linked in index.html) holds
// the colours, sizes, motion and layers; kit.css the components; hud.css the HUD pieces. See the UI
// section of story-mechanics/VILLAGE_ROADMAP.md for the principles.
import './kit.css';
import './hud.css';
import { registerHotkey } from './hotkeys';
import { disposeUiRoot, ensureUiRoot } from './layers';
import { disposeNotifications } from './notify';
import { disposePanels } from './panels';
import { applyUiSettings } from './settings';
import { toggleSettingsPanel } from './settingsPanel';
import { disposeTooltip } from './tooltip';

export { type ButtonOptions, button } from './button';
export { openConfirmPanel } from './confirmPanel';
export { append, type Child, type ElProps, h } from './dom';
export { type HotkeyOptions, listHotkeys, registerHotkey } from './hotkeys';
export { type IconName, type IconOptions, icon } from './icons';
export { getHudSlot, getLayer, type LayerName } from './layers';
export { dismissNotification, type NotifyInput, type NotifyKind, notify } from './notify';
export {
  closePanel,
  closeTopPanel,
  isModalPanelOpen,
  isPanelOpen,
  onPanelsChanged,
  openPanel,
  type PanelHandle,
  type PanelOptions,
  setPanelPauseHandler,
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
  return () => {
    offSettingsKey();
    disposePanels();
    disposeNotifications();
    disposeTooltip();
    disposeUiRoot();
  };
}
