// src/map/playMapSelection.ts — play-mode map id from URL or sessionStorage
import { fetchMapById } from './MapIO';
import type { MapFile } from './MapTypes';
import { PlayMapValidationError, validatePlayMapForPlay } from './validatePlayMap';

export const PLAY_MAP_SESSION_KEY = 'pantheon-play-map-id';

/** Active map id for play mode, or empty when none selected yet. */
export function getPlayMapId(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('map')?.trim().toLowerCase() ?? '';
  if (fromUrl) {
    sessionStorage.setItem(PLAY_MAP_SESSION_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(PLAY_MAP_SESSION_KEY)?.trim().toLowerCase() ?? '';
}

export function hasPlayMapId(): boolean {
  return getPlayMapId().length > 0;
}

export function setPlayMapId(id: string): void {
  const normalized = id.trim().toLowerCase();
  if (!normalized) {
    sessionStorage.removeItem(PLAY_MAP_SESSION_KEY);
    return;
  }
  sessionStorage.setItem(PLAY_MAP_SESSION_KEY, normalized);
}

export async function loadPlayMapFile(): Promise<MapFile> {
  const id = getPlayMapId();
  if (!id) {
    throw new PlayMapValidationError('No map selected.');
  }
  try {
    const map = await fetchMapById(id);
    validatePlayMapForPlay(map);
    return map;
  } catch (e) {
    if (e instanceof PlayMapValidationError) throw e;
    console.warn(`[maps] Failed to load play map "${id}":`, e);
    if (import.meta.env.DEV) {
      sessionStorage.removeItem(PLAY_MAP_SESSION_KEY);
    }
    throw new Error(`Failed to load map "${id}". Check public/maps/${id}.json and manifest.json.`);
  }
}
