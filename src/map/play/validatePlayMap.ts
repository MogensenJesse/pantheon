// src/map/play/validatePlayMap.ts — play-mode map requirements
import type { MapFile } from '../MapTypes';

export class PlayMapValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayMapValidationError';
  }
}

export function validatePlayMapForPlay(map: MapFile): void {
  const hasPlayerStart = map.entities?.some((e) => e.type === 'playerStart');
  if (!hasPlayerStart) {
    throw new PlayMapValidationError(
      `Map "${map.id}" is missing a playerStart entity. Place one in the map editor.`,
    );
  }
}
