// src/map/playMapSelection.ts — DEV play-mode map id from URL or sessionStorage
import { fetchMapById } from './MapIO';
import type { MapFile } from './MapTypes';

export const PLAY_MAP_SESSION_KEY = 'pantheon-play-map-id';

const PROCEDURAL_VALUE = '';

/** Active map id for play mode, or empty string for procedural terrain. */
export function getPlayMapId(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('map')?.trim().toLowerCase() ?? '';
  if (fromUrl) {
    sessionStorage.setItem(PLAY_MAP_SESSION_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(PLAY_MAP_SESSION_KEY)?.trim().toLowerCase() ?? '';
}

export function setPlayMapId(id: string): void {
  const normalized = id.trim().toLowerCase();
  if (normalized) {
    sessionStorage.setItem(PLAY_MAP_SESSION_KEY, normalized);
  } else {
    sessionStorage.removeItem(PLAY_MAP_SESSION_KEY);
  }
}

export async function loadPlayMapFile(): Promise<MapFile | null> {
  const id = getPlayMapId();
  if (!id) return null;
  try {
    return await fetchMapById(id);
  } catch (e) {
    console.warn(`[maps] Failed to load play map "${id}":`, e);
    if (import.meta.env.DEV) {
      sessionStorage.removeItem(PLAY_MAP_SESSION_KEY);
    }
    return null;
  }
}

export function isProceduralPlayMap(id: string): boolean {
  return id === PROCEDURAL_VALUE;
}

export const PLAY_MAP_PROCEDURAL_VALUE = PROCEDURAL_VALUE;
