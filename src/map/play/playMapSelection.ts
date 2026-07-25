// src/map/play/playMapSelection.ts — play-mode map id from URL or sessionStorage
import { fetchMapById } from '../MapIO';
import { isValidMapId, type MapFile, normalizeMapId } from '../MapTypes';
import { PlayMapValidationError, validatePlayMapForPlay } from './validatePlayMap';

const PLAY_MAP_SESSION_KEY = 'pantheon-play-map-id';

function readStoredPlayMapId(): string {
  const stored = sessionStorage.getItem(PLAY_MAP_SESSION_KEY)?.trim().toLowerCase() ?? '';
  if (!stored) return '';
  if (!isValidMapId(stored)) {
    sessionStorage.removeItem(PLAY_MAP_SESSION_KEY);
    return '';
  }
  return stored;
}

/** Active map id for play mode, or empty when none selected yet. */
export function getPlayMapId(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('map')?.trim().toLowerCase() ?? '';
  if (fromUrl) {
    if (!isValidMapId(fromUrl)) return '';
    sessionStorage.setItem(PLAY_MAP_SESSION_KEY, fromUrl);
    return fromUrl;
  }
  return readStoredPlayMapId();
}

export function hasPlayMapId(): boolean {
  return getPlayMapId().length > 0;
}

export function setPlayMapId(id: string): void {
  const normalized = normalizeMapId(id);
  if (!normalized) {
    sessionStorage.removeItem(PLAY_MAP_SESSION_KEY);
    return;
  }
  if (!isValidMapId(normalized)) return;
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
