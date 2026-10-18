// src/dev/runtime/uiProbe.ts — DEV console hook: window.__pantheonUi

import {
  getUiSettings,
  listHotkeys,
  notify,
  openSettingsPanel,
  updateUiSettings,
} from '../../ui/kit';
import { installDevHook } from './devHook';

/** Install `window.__pantheonUi`: settings, toasts and the hotkey table from the console. */
export function initUiProbe(): () => void {
  const removeHook = installDevHook('__pantheonUi', {
    openSettings: openSettingsPanel,
    notify,
    settings: getUiSettings,
    update: updateUiSettings,
    hotkeys: listHotkeys,
  });
  return removeHook;
}
