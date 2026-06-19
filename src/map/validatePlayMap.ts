// src/map/validatePlayMap.ts — play-mode map requirements
import { isAuthoredGameplayLayout, type MapFile } from './MapTypes';

export class PlayMapValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayMapValidationError';
  }
}

export function validatePlayMapForPlay(map: MapFile): void {
  if (!isAuthoredGameplayLayout(map)) {
    throw new PlayMapValidationError(
      `Map "${map.id}" has no gameplay entities. Add playerStart and/or orbs in the map editor.`,
    );
  }
  const hasPlayerStart = map.entities?.some((e) => e.type === 'playerStart');
  if (!hasPlayerStart) {
    throw new PlayMapValidationError(
      `Map "${map.id}" is missing a playerStart entity. Place one in the map editor.`,
    );
  }
}
