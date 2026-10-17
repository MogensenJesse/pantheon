// src/ui/saves/index.ts — the save and load screens, on the UI kit
import './saves.css';

export { type AutosaveIndicator, createAutosaveIndicator } from './autosaveIndicator';
export { createPauseMenu, type PauseMenu, type PauseMenuDeps } from './pauseMenu';
export { openConfirmPanel, openSlotPanel, type SlotPanelOptions } from './slotPanel';
export { type StartScreenOptions, showStartScreen } from './startScreen';
export { initTempleSave, type TempleSaveDeps } from './templeSave';
